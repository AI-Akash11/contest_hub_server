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
    const submissionsCollection = db.collection("submissions");

    // role middlewares
    const verifyAdmin = async (req, res, next) => {
      const email = req.tokenEmail;
      const user = await usersCollection.findOne({ email });
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ message: "Admin only Actions!", role: user?.role });
      }
      next();
    };
    const verifyCreator = async (req, res, next) => {
      const email = req.tokenEmail;
      const user = await usersCollection.findOne({ email });
      if (user?.role !== "creator") {
        return res
          .status(403)
          .send({ message: "Creator only Actions!", role: user?.role });
      }
      next();
    };

    // user api--------------------------------------------------------------
    app.get("/user", verifyJWT, async (req, res) => {
      const email = req.tokenEmail;
      const result = await usersCollection.findOne({
        email: { $regex: `^${email}$`, $options: "i" },
      });

      res.send(result);
    });

    app.get("/role", verifyJWT, async (req, res) => {
      const result = await usersCollection.findOne({ email: req.tokenEmail });
      if (!result) {
        return res.status(404).send({ message: "User not found" });
      }
      res.send({ role: result.role });
    });

    app.get("/all-users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    app.post("/user", async (req, res) => {
      const userData = req.body;
      userData.role = "user";
      userData.createdAt = new Date();
      userData.userActions = {
        contestsParticipated: 0,
        contestsWon: 0,
        totalWinnings: 0,
      };

      userData.creatorActions = {
        contestsCreated: 0,
        contestsCompleted: 0,
        totalPrizePaid: 0,
      };

      userData.adminActions = {
        approved: 0,
        rejected: 0,
        deleted: 0,
      };

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

    app.patch("/user/role/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const userRole = req.body.role;
      const roleUpdate = {
        $set: {
          role: userRole,
        },
      };
      const result = await usersCollection.updateOne({ email }, roleUpdate);

      res.send({ message: "Role updated successfully" });
    });

    app.patch("/user/update", verifyJWT, async (req, res) => {
      const email = req.tokenEmail;
      const { name, bio, image } = req.body;
      const result = await usersCollection.updateOne(
        { email },
        {
          $set: {
            name,
            bio,
            image,
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return res.status(404).send({ message: "User not found" });
      }

      const updatedUser = await usersCollection.findOne({ email });
      res.send({
        message: "Profile updated successfully",
        user: updatedUser,
      });
    });

    // all contest api-----------------------------------------------------
    app.get("/all-contests", async (req, res) => {
      const query = { status: "approved" };
      const result = await contestsCollection.find(query).toArray();
      res.send(result);
    });

    // manage contest api--------------------------------------------------
    app.get("/admin/contests", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await contestsCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    app.patch(
      "/admin/contests/approve/:contestId",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const { contestId } = req.params;
        const query = { _id: new ObjectId(contestId), status: "pending" };
        const updatedDoc = {
          $set: {
            status: "approved",
          },
        };
        const result = await contestsCollection.updateOne(query, updatedDoc);
        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ message: "Contest not found or already processed" });
        }

        await usersCollection.updateOne(
          { email: req.tokenEmail },
          { $inc: { "adminActions.approved": 1 } },
        );
        res.send(result);
      },
    );

    app.patch(
      "/admin/contests/reject/:contestId",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const { contestId } = req.params;
        const query = { _id: new ObjectId(contestId), status: "pending" };
        const updatedDoc = {
          $set: {
            status: "rejected",
          },
        };
        const result = await contestsCollection.updateOne(query, updatedDoc);
        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ message: "Contest not found or already processed" });
        }

        await usersCollection.updateOne(
          { email: req.tokenEmail },
          { $inc: { "adminActions.rejected": 1 } },
        );
        res.send(result);
      },
    );

    app.delete(
      "/admin/contests/:contestId",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const { contestId } = req.params;
        const query = {
          _id: new ObjectId(contestId),
          status: { $ne: "approved" },
        };

        const result = await contestsCollection.deleteOne(query);
        if (result.deletedCount === 0) {
          return res
            .status(404)
            .send({ message: "Contest not found or already processed" });
        }

        await usersCollection.updateOne(
          { email: req.tokenEmail },
          { $inc: { "adminActions.deleted": 1 } },
        );
        res.send(result);
      },
    );

    // submissions api-------------------------------------------

    app.get(
      "/contest-submissions/:contestId",
      verifyJWT,
      verifyCreator,
      async (req, res) => {
        const { contestId } = req.params;
        const creatorEmail = req.tokenEmail;

        const contest = await contestsCollection.findOne({
          _id: new ObjectId(contestId),
          "creator.email": creatorEmail,
        });

        if (!contest) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const result = await submissionsCollection
          .find({ contestId })
          .sort({ submittedAt: -1 })
          .toArray();

        res.send(result);
      },
    );

    app.get("/my-submission/:contestId", verifyJWT, async (req, res) => {
      const { contestId } = req.params;
      const email = req.tokenEmail;
      const result = await submissionsCollection.findOne({
        contestId,
        participantEmail: email,
      });
      res.send(result || {});
    });

    app.post("/submit-task", verifyJWT, async (req, res) => {
      const { contestId, submissionLink } = req.body;
      const email = req.tokenEmail;

      const registration = await paymentsCollection.findOne({
        contestId,
        participantEmail: email,
        status: "paid",
      });
      if (!registration) {
        return res.status(403).send({
          message: "You must register for this contest first",
        });
      }

      const contest = await contestsCollection.findOne({
        _id: new ObjectId(contestId),
      });

      if (new Date(contest.deadline) < new Date()) {
        return res.status(400).send({
          message: "Contest deadline has passed",
        });
      }

      const submissionExists = await submissionsCollection.findOne({
        contestId,
        participantEmail: email,
      });

      if (submissionExists) {
        await submissionsCollection.updateOne(
          { contestId, participantEmail: email },
          {
            $set: {
              submissionLink,
            },
          },
        );
        res.send({ message: "Submission updated successfully" });
      } else {
        const submissionData = {
          contestId,
          contestName: contest.name,
          participantEmail: email,
          participantName: registration.participantName,
          participantImage: registration.participantImage,
          submissionLink,
          status: "pending",
          submittedAt: new Date(),
        };

        await submissionsCollection.insertOne(submissionData);
        res.send({ message: "Submission recorded successfully" });
      }
    });

    // winner api------------------------------------
    app.patch(
      "/submissions/declare-winner/:submissionId",
      verifyJWT,
      verifyCreator,
      async (req, res) => {
        const { submissionId } = req.params;

        const submission = await submissionsCollection.findOne({
          _id: new ObjectId(submissionId),
        });

        if (!submission) {
          return res.status(404).send({ message: "Submission not found" });
        }

        const contest = await contestsCollection.findOne({
          _id: new ObjectId(submission.contestId),
        });

        if (!contest) {
          return res.status(404).send({ message: "Contest not found" });
        }

        if (contest.creator.email !== req.tokenEmail) {
          return res
            .status(403)
            .send({ message: "Only contest creator can declare winner" });
        }

        if (contest.winner?.status === "declared") {
          return res.status(400).send({
            message: "Winner has already been declared for this contest",
          });
        }

        await submissionsCollection.updateMany(
          { contestId: submission.contestId },
          { $set: { status: "not_selected" } },
        );

        await submissionsCollection.updateOne(
          { _id: new ObjectId(submissionId) },
          { $set: { status: "winner" } },
        );

        await contestsCollection.updateOne(
          { _id: new ObjectId(submission.contestId) },
          {
            $set: {
              winner: {
                status: "declared",
                name: submission.participantName,
                email: submission.participantEmail,
                image: submission.participantImage,
                submissionId,
                declaredAt: new Date(),
              },
            },
          },
        );

        await usersCollection.updateOne(
          { email: submission.participantEmail },
          {
            $inc: {
              "userActions.contestsWon": 1,
              "userActions.totalWinnings": contest.prizeMoney,
            },
          },
        );

        await usersCollection.updateOne(
          { email: contest.creator.email },
          {
            $inc: {
              "creatorActions.contestsCompleted": 1,
              "creatorActions.totalPrizePaid": contest.prizeMoney,
            },
          },
        );

        res.send({ message: "Winner declared successfully" });
      },
    );

    app.get("/my-winnings", verifyJWT, async (req, res) => {
      const email = req.tokenEmail;

      const winnings = await contestsCollection
        .find({
          "winner.email": email,
          "winner.status": "declared",
        })
        .project({
          name: 1,
          image: 1,
          prizeMoney: 1,
        })
        .toArray();

      const formatted = winnings.map((contest) => ({
        contestId: contest._id,
        name: contest.name,
        image: contest.image,
        prize: contest.prizeMoney,
      }));

      res.send(formatted);
    });

    // popular contest api------------------------------------
    app.get("/popular-contests", async (req, res) => {
      const result = await contestsCollection
        .find({ status: "approved" })
        .sort({ participantCount: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // single contest api------------------------------------
    app.get("/contest/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await contestsCollection.findOne(query);
      res.send(result);
    });

    app.post("/contest", verifyJWT, verifyCreator, async (req, res) => {
      const contestData = req.body;
      contestData.createdAt = new Date();
      contestData.deadline = new Date(contestData.deadline);

      contestData.winner = {
        status: "pending",
        name: null,
        email: null,
        image: null,
      };

      const result = await contestsCollection.insertOne(contestData);
      await usersCollection.updateOne(
        { email: req.tokenEmail },
        {
          $inc: {
            "creatorActions.contestsCreated": 1,
          },
        },
      );
      res.send(result);
    });

    app.patch("/contest/:id", verifyJWT, verifyCreator, async (req, res) => {
      const { id } = req.params;
      const updatedData = req.body;
      const email = req.tokenEmail;

      const contest = await contestsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!contest) {
        return res.status(404).send({ message: "Contest not found" });
      }

      if (contest.creator.email !== email) {
        return res.status(403).send({
          message: "You can only edit your own contests",
        });
      }

      if (contest.status !== "pending") {
        return res.status(400).send({
          message: "Only pending contests can be edited.",
        });
      }

      if (!updatedData) {
        return res.status(400).send({
          message: "Updated Data is required",
        });
      }

      const result = await contestsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            name: updatedData.name,
            image: updatedData.image,
            description: updatedData.description,
            contestType: updatedData.contestType,
            prizeMoney: updatedData.prizeMoney,
            entryFee: updatedData.entryFee,
            taskInstruction: updatedData.taskInstruction,
            deadline: new Date(updatedData.deadline),
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return res.status(404).send({ message: "Contest not found" });
      }

      res.send({ message: "Contest updated successfully" });
    });

    // creator contest api-----------------------------------
    app.get("/my-contests", verifyJWT, verifyCreator, async (req, res) => {
      const email = req.tokenEmail;
      const result = await contestsCollection
        .find({ "creator.email": email })
        .toArray();
      res.send(result);
    });

    app.delete(
      "/my-contests/:contestId",
      verifyJWT,
      verifyCreator,
      async (req, res) => {
        const { contestId } = req.params;
        const query = { _id: new ObjectId(contestId) };

        const contest = await contestsCollection.findOne(query);
        if (!contest) {
          return res.status(404).send({ message: "Contest not found" });
        }

        if (contest.status !== "pending") {
          return res.status(400).send({
            message: "Only pending contests can be deleted",
          });
        }

        const result = await contestsCollection.deleteOne(query);
        res.send(result);
      },
    );

    // user participated api---------------------------------
    app.get("/my-participated", verifyJWT, async (req, res) => {
      try {
        const email = req.tokenEmail;

        const result = await paymentsCollection
          .aggregate([
            // Match payments for this user
            {
              $match: {
                participantEmail: email,
                status: "paid",
              },
            },
            // Convert contestId string to ObjectId for lookup
            {
              $addFields: {
                contestObjectId: { $toObjectId: "$contestId" },
              },
            },
            // Join with contests collection
            {
              $lookup: {
                from: "contests",
                localField: "contestObjectId",
                foreignField: "_id",
                as: "contestDetails",
              },
            },
            // Unwind the array (since lookup returns an array)
            {
              $unwind: {
                path: "$contestDetails",
                preserveNullAndEmptyArrays: true,
              },
            },
            // Add deadline from contest to payment document
            {
              $addFields: {
                deadline: "$contestDetails.deadline",
                contestStatus: "$contestDetails.status",
              },
            },
            // Sort by deadline (most recent first)
            {
              $sort: { deadline: -1 },
            },
            // Project only the fields you need
            {
              $project: {
                _id: 1,
                contestId: 1,
                participantName: 1,
                participantEmail: 1,
                participantImage: 1,
                price: 1,
                transactionId: 1,
                status: 1,
                paidAt: 1,
                name: 1,
                image: 1,
                deadline: 1,
                contestStatus: 1,
              },
            },
          ])
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Get participated contests error:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/check-payments/:contestId", verifyJWT, async (req, res) => {
      const { contestId } = req.params;
      const email = req.tokenEmail;

      const result = await paymentsCollection.findOne({
        contestId,
        participantEmail: email,
        status: "paid",
      });

      res.send({ hasPaid: !!result });
    });

    // become creator api-------------------------------
    app.get("/creator-requests", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await creatorRequestsCollection.find().toArray();
      res.send(result);
    });

    app.post("/become-creator", verifyJWT, async (req, res) => {
      const email = req.tokenEmail;
      console.log(email);
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
      verifyAdmin,
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

    app.delete(
      "/creator-requests/delete/:email",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const result = await creatorRequestsCollection.deleteOne({ email });
        res.send(result);
      },
    );

    // payment endpoints----------------------------------
    app.post("/create-checkout-session", verifyJWT, async (req, res) => {
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

        await usersCollection.updateOne(
          { email: session.metadata.participantEmail },
          {
            $inc: {
              "userActions.contestsParticipated": 1,
            },
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
