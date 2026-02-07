require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const admin = require("firebase-admin");
const port = process.env.PORT || 3000;
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf-8",
);
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
// middleware
app.use(
  cors({
    origin: [process.env.CLIENT_DOMAIN],
    credentials: true,
    optionSuccessStatus: 200,
  }),
);
app.use(express.json());

// jwt middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "Unauthorized Access!", err });
  }
};

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    const db = client.db("contestsDB");
    const contestsCollection = db.collection("contests");
    const paymentsCollection = db.collection("payments");
    const usersCollection = db.collection("users");
    const creatorRequestsCollection = db.collection("creatorRequests");

    // user api----------------------------------------
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email: email });

      res.send(result);
    });

    app.get("/role", verifyJWT, async (req, res) => {
      const email = req.tokenEmail;
      const result = await usersCollection.findOne({ email });
      res.send({ role: result.role });
    });

    app.get("/all-users", verifyJWT, async(req, res)=>{
      const result = await usersCollection.find().sort({createdAt: -1}).toArray();
      res.send(result);
    })

    app.post("/user", async (req, res) => {
      const userData = req.body;
      userData.role = "user";
      userData.createdAt = new Date();

      const userExists = await usersCollection.findOne({
        email: userData.email,
      });

      if (userExists) {
        return res.send({
          message: "User already exists",
        });
      }

      const result = await usersCollection.insertOne(userData);

      res.send(result);
    });

    app.patch("/user/role/:email", verifyJWT, async(req, res)=>{
      const email = req.params.email;
      const userRole = req.body.role;
      const roleUpdate = {
        $set: {
          role: userRole
        }
      }
      const result = await usersCollection.updateOne({email}, roleUpdate);

      res.send({ message: "Role updated successfully"})
    })

    // all contest api-------------------------------------
    app.get("/all-contests", async (req, res) => {
      const result = await contestsCollection.find().toArray();
      res.send(result);
    });

    // popular contest api------------------------------------
    app.get("/popular-contests", async (req, res) => {
      const result = await contestsCollection
        .find()
        .sort({ participantCount: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // single contest api------------------------------------
    app.get("/contest/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await contestsCollection.findOne(query);
      res.send(result);
    });

    app.post("/contest", async (req, res) => {
      const contestData = req.body;
      contestData.createdAt = new Date();
      contestData.deadline = new Date(contestData.deadline);

      const result = await contestsCollection.insertOne(contestData);
      res.send(result);
    });

    // creator contest api-----------------------------------
    app.get("/my-contests/:email", async (req, res) => {
      const { email } = req.params;
      const result = await contestsCollection
        .find({ "creator.email": email })
        .toArray();
      res.send(result);
    });

    // user participated api---------------------------------
    app.get("/my-participated", verifyJWT, async (req, res) => {
      const email = req.tokenEmail;

      const result = await paymentsCollection
        .find({ participantEmail: email })
        .toArray();

      res.send(result);
    });

    app.delete("/my-contests/:contestId", async (req, res) => {
      const { contestId } = req.params;
      const query = { _id: new ObjectId(contestId) };
      const result = await contestsCollection.deleteOne(query);
      res.send(result);
    });

    // become creator api-------------------------------
    app.get("/creator-requests", verifyJWT, async (req, res) => {
      const result = await creatorRequestsCollection.find().toArray();
      res.send(result);
    });

        app.post("/become-creator", verifyJWT, async (req, res) => {
      const email = req.tokenEmail;
      console.log(email)
      const requestExists = await creatorRequestsCollection.findOne({ email });
      if (requestExists) {
        return res.status(400).send({
          message:
            "You have already requested to become a creator. Please wait patiently for the admin to review",
        });
      }

      const requestData = {
        email,
        requestedAt: new Date(),
      };
      const result = await creatorRequestsCollection.insertOne(requestData);
      res.send(result);
    });

    app.patch(
      "/creator-requests/approve/:email",
      verifyJWT,
      async (req, res) => {
        const userEmail = req.params.email;
        const query = { email: userEmail };
        const updatedDoc = {
          $set: {
            role: "creator",
          },
        };
        const result = await usersCollection.updateOne(query, updatedDoc);
        await creatorRequestsCollection.deleteOne({ email: userEmail });

        res.send({ success: true });
      },
    );

    app.delete("/creator-requests/delete/:email", verifyJWT, async(req, res)=>{
      const email = req.params.email;
      const result = await creatorRequestsCollection.deleteOne({email});
      res.send(result)
    })

    // payment endpoints----------------------------------
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: paymentInfo?.name,
                description: paymentInfo?.description,
                images: [paymentInfo?.image],
              },
              unit_amount: paymentInfo?.price * 100,
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo?.participant.email,
        mode: "payment",
        metadata: {
          contestId: String(paymentInfo?.contestId || ""),
          participantEmail: String(paymentInfo?.participant?.email),
          participantName: String(paymentInfo?.participant?.name),
          participantImage: String(paymentInfo?.participant?.image),
        },

        success_url: `${process.env.CLIENT_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_DOMAIN}/contest/${paymentInfo?.contestId}`,
      });

      res.send({ url: session.url });
    });

    app.post("/payment-success", async (req, res) => {
      const { sessionId } = req.body;

      const session = await stripe.checkout.sessions.retrieve(sessionId);

      const contest = await contestsCollection.findOne({
        _id: new ObjectId(session.metadata.contestId),
      });

      const payment = await paymentsCollection.findOne({
        transactionId: session.payment_intent,
      });

      if (session.status === "complete" && contest && !payment) {
        const paymentInfo = {
          contestId: session.metadata.contestId,
          participantName: session.metadata.participantName,
          participantEmail: session.metadata.participantEmail,
          participantImage: session.metadata.participantImage,
          price: session.amount_total / 100,
          transactionId: session.payment_intent,
          status: "paid",
          paidAt: new Date(),
          creator: contest.creator,
          name: contest.name,
          image: contest.image,
        };

        const result = await paymentsCollection.insertOne(paymentInfo);

        await contestsCollection.updateOne(
          {
            _id: new ObjectId(session.metadata.contestId),
          },
          {
            $inc: { participantCount: 1 },
          },
        );
        return res.send({
          transactionId: session.payment_intent,
          paymentId: result.insertedId,
        });
      }
      res.send({
        transactionId: session.payment_intent,
        paymentId: payment._id,
      });
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from Server..");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
