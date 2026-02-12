# ContestHub

A modern, full-stack contest management platform that allows users to create, discover, participate in, and manage creative contests across various categories.

## 🔗 Live Links

- **Live Site**: [https://contest-hub-8cf05.web.app/]
- **Client Repository**: [https://github.com/AI-Akash11/contest_hub_client]
- **Server Repository**: [https://github.com/AI-Akash11/contest_hub_server]


## ✨ Key Features

1. **Three-Tier Role System** - Supports Admin, Contest Creator, and Normal User roles with specific permissions and dashboards
2. **Secure Authentication** - JWT-based authentication with email/password and Google sign-in integration
3. **Payment Integration** - Stripe payment gateway for contest registration with real-time participant count updates
4. **Contest Management** - Creators can add, edit, and delete contests before admin approval
5. **Winner Declaration System** - Contest creators can declare winners after deadline with automated achievement tracking
6. **Live Deadline Countdown** - Real-time countdown timer for active contests with automatic status updates
7. **Advanced Search & Filtering** - Search contests by type with dynamic category tabs and pagination
8. **Task Submission Portal** - Registered participants can submit their contest entries through modal interface
9. **Comprehensive Dashboards** - Role-specific dashboards with personalized statistics and management tools
10. **Leaderboard System** - Dynamic ranking of users based on contest wins with achievement badges
11. **Dark/Light Theme Toggle** - Persistent theme preference saved in localStorage
12. **Responsive Design** - Fully responsive across mobile, tablet, and desktop devices
13. **Win Percentage Analytics** - Visual chart displaying user's success rate in participated contests
14. **Contest Approval Workflow** - Admin review system for quality control before contests go live
15. **Winner Advertisement Section** - Motivational showcase of recent winners and prize distributions

## 🛠️ Technologies Used

### Frontend
- **React.js** - UI library
- **React Router** - Client-side routing
- **TanStack Query** - Data fetching and state management
- **React Hook Form** - Form validation and handling
- **Tailwind CSS** - Utility-first CSS framework
- **DaisyUI** - Component library
- **Framer Motion** - Animation library
- **SweetAlert2** - Beautiful alerts and modals
- **React Hot Toast** - Toast notifications
- **React CountUp** - Animated counters
- **React DatePicker** - Date selection
- **Axios** - HTTP client

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **JWT** - Authentication tokens
- **Stripe** - Payment processing
- **Firebase Admin** - User authentication

### Deployment
- **Client**: Firebase
- **Server**: Vercel


## 📱 User Roles & Permissions

### Normal User
- Browse and search contests
- Register for contests via payment
- Submit contest tasks
- View participated and won contests
- Update profile information

### Contest Creator
- Create new contests
- Edit/delete pending contests
- View submissions
- Declare winners after deadline

### Admin
- Approve/reject contests
- Manage user roles
- Delete any contest
- Full platform oversight

## 🎯 Key Functionalities

### Contest Workflow
1. Creator submits contest → Pending status
2. Admin reviews → Approved/Rejected
3. Users discover → Register via payment
4. Deadline countdown → Live tracking
5. Users submit tasks → Before deadline
6. Creator reviews → Declares winner
7. Winner showcase → Platform-wide

### Payment Flow
1. User clicks "Register" on contest
2. Redirects to Stripe checkout
3. Payment processed securely
4. Success → User registered + count updated
5. Confirmation → Access to submit task

## 🎨 Design Highlights

- Clean, modern UI with gradient accents
- Smooth animations and transitions
- Intuitive navigation and user flow
- Consistent color scheme and typography
- Desktop-first responsive design
- Loading states and error handling
- Toast notifications for user actions

## 🔒 Security Features

- JWT token authentication
- Protected API routes
- Environment variables for secrets
- Firebase authentication
- Secure payment processing
- Role-based access control

## 📊 Additional Features

- **Pagination**
- **Real-time Updates**
- **Search Functionality**
- **Data Validation**
- **Error Handling**
- **Performance Optimization**

## 📄 License

This project is licensed under the MIT License.

## 👨‍💻 Developer

**Your Name**
- GitHub: [https://github.com/AI-Akash11]
- LinkedIn: [https://www.linkedin.com/in/ali-imam-akash/]
---

**Built with ❤️ for creative communities**