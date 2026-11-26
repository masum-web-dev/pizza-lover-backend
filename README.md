# PizzaHub — Pizza Ordering & Delivery Platform (Backend)

REST API backend for PizzaHub built with **Node.js**, **Express.js**, and **MongoDB**, handling role-based access control, menu and order management, vendor subscriptions, and Stripe webhook verification.

## Live & Repository Links
- **Live Backend API:** https://pizza-lover-backend.vercel.app
- **Live Frontend:** https://pizza-lover-frontend.vercel.app
- **Server Repo:** `https://github.com/YOUR_USERNAME/pizzahub-backend`
- **Client Repo:** `https://github.com/YOUR_USERNAME/pizzahub-frontend`

## Technologies & Packages Used
- **Runtime & Framework:** Node.js, Express.js
- **Database:** MongoDB (Mongoose / MongoDB Driver)
- **Authentication & Security:** JWT verification, role-based middleware (`customer`, `vendor`, `admin`), CORS
- **Payments:** Stripe Checkout & Stripe Webhooks

## What's Inside (Core Backend Features)
- **Role & Ownership Verification:** Protected routes and server-side checks for `Customer`, `Vendor`, and `Admin` actions and resource ownership.
- **Menu & Order APIs:** Menu item CRUD with approval/status handling (`pending`, `approved`, `rejected`, `inactive`), search/filter/sort queries, and order creation, status updates, and cancellation.
- **Subscription & Webhooks:** Stripe Checkout session creation for Vendor Premium upgrades and webhook-verified subscription & transaction updates.
- **Admin Endpoints:** User management, menu moderation, and read-only transaction history access.

## Environment Variables
```env
PORT=
MONGODB_URI=
JWT_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
CLIENT_URL=
