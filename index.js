import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const app = express();
const port = process.env.PORT || process.env.port || 8000;

app.use(express.json());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  })
);

const mongoUri =
  process.env.MONGODB_URI ||
  `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.0xcdsqr.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(mongoUri);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log('You successfully connected to MongoDB!');
    return client;
  } catch (err) {
    console.error('MongoDB connection error:', err);
    throw err;
  }
}

const connectedClient = await connectToMongoDB();
const database = connectedClient.db('pizzaloverdb');

const usersCollection = database.collection('users');
const menuItemsCollection = database.collection('menuItems');
const ordersCollection = database.collection('orders');
const transactionsCollection = database.collection('transactions');

function isValidObjectId(id) {
  return typeof id === 'string' && ObjectId.isValid(id);
}

function isItemApprovedAndActive(item) {
  const status = String(item.status || 'approved').toLowerCase();
  const active = item.isActive === undefined ? true : Boolean(item.isActive);
  return status === 'approved' && active;
}

app.get('/', (req, res) => {
  res.send('PizzaHub Backend is running!');
});

// GET /api/pizzas — Only approved & active items + search, category, location, price sort
app.get('/api/pizzas', async (req, res) => {
  try {
    const {
      search = '',
      category = '',
      location = '',
      sort = '',
    } = req.query;

    const rawItems = await menuItemsCollection.find({}).toArray();
    let items = rawItems.filter(isItemApprovedAndActive);

    const searchTrimmed = String(search).trim().toLowerCase();
    if (searchTrimmed) {
      items = items.filter((item) => {
        const name = String(item.itemName || item.name || '').toLowerCase();
        const desc = String(item.description || '').toLowerCase();
        const loc = String(item.location || '').toLowerCase();
        return (
          name.includes(searchTrimmed) ||
          desc.includes(searchTrimmed) ||
          loc.includes(searchTrimmed)
        );
      });
    }

    const categoryTrimmed = String(category).trim();
    if (categoryTrimmed && categoryTrimmed.toLowerCase() !== 'all') {
      items = items.filter(
        (item) =>
          String(item.category || '').toLowerCase() ===
          categoryTrimmed.toLowerCase()
      );
    }

    const locationTrimmed = String(location).trim();
    if (locationTrimmed && locationTrimmed.toLowerCase() !== 'all') {
      items = items.filter(
        (item) =>
          String(item.location || '').toLowerCase() ===
          locationTrimmed.toLowerCase()
      );
    }

    if (sort === 'price-asc') {
      items.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    } else if (sort === 'price-desc') {
      items.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    } else {
      items.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
      );
    }

    res.status(200).json(items);
  } catch (err) {
    console.error('Error fetching pizzas:', err);
    res.status(500).json({ message: 'Failed to fetch pizzas' });
  }
});

// GET /api/pizzas/:id — Single menu item details
app.get('/api/pizzas/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid menu item ID.' });
    }

    const item = await menuItemsCollection.findOne({ _id: new ObjectId(id) });

    if (!item) {
      return res.status(404).json({ message: 'Menu item not found.' });
    }

    res.status(200).json(item);
  } catch (err) {
    console.error('Error fetching pizza by id:', err);
    res.status(500).json({ message: 'Failed to fetch menu item details.' });
  }
});

// POST /api/orders — Place a customer order with role, ownership & duplicate checks
app.post('/api/orders', async (req, res) => {
  try {
    const {
      itemId,
      customerId,
      customerName,
      customerEmail,
      deliveryDate,
      deliveryAddress,
      message = '',
    } = req.body;

    if (!itemId || !isValidObjectId(String(itemId))) {
      return res.status(400).json({ message: 'Valid itemId is required.' });
    }

    if (!customerId || !String(customerId).trim()) {
      return res.status(401).json({ message: 'Customer authentication required.' });
    }

    if (!deliveryDate || !String(deliveryDate).trim()) {
      return res.status(400).json({ message: 'Delivery date is required.' });
    }

    if (!deliveryAddress || String(deliveryAddress).trim().length < 5) {
      return res
        .status(400)
        .json({ message: 'Valid delivery address is required.' });
    }

    // Optional DB user check if present in users collection
    let dbUser = null;
    if (isValidObjectId(String(customerId))) {
      dbUser = await usersCollection.findOne({ _id: new ObjectId(String(customerId)) });
    }
    if (!dbUser && customerEmail) {
      dbUser = await usersCollection.findOne({ email: String(customerEmail).trim() });
    }

    if (dbUser?.isBlocked) {
      return res
        .status(403)
        .json({ message: 'Your account is blocked from placing orders.' });
    }

    const effectiveRole = String(dbUser?.role || 'customer').toLowerCase();
    if (effectiveRole === 'admin') {
      return res
        .status(403)
        .json({ message: 'Admins cannot place customer orders.' });
    }

    const menuItem = await menuItemsCollection.findOne({
      _id: new ObjectId(String(itemId)),
    });

    if (!menuItem) {
      return res.status(404).json({ message: 'Menu item not found.' });
    }

    if (!isItemApprovedAndActive(menuItem)) {
      return res.status(400).json({
        message: 'Only approved and active menu items can be ordered.',
      });
    }

    const vendorIdStr = String(menuItem.vendorId || '');
    const customerIdStr = String(customerId).trim();

    if (vendorIdStr && vendorIdStr === customerIdStr) {
      return res
        .status(403)
        .json({ message: 'Vendors cannot order their own menu items.' });
    }

    // Prevent duplicate active orders for same item and delivery date
    const normalizedDate = String(deliveryDate).trim();
    const existingActiveOrder = await ordersCollection.findOne({
      itemId: String(itemId),
      customerId: customerIdStr,
      deliveryDate: normalizedDate,
      status: { $in: ['pending', 'accepted'] },
    });

    if (existingActiveOrder) {
      return res.status(409).json({
        message:
          'You already have an active order for this item on the selected delivery date.',
      });
    }

    const primaryImage =
      (Array.isArray(menuItem.images) && menuItem.images[0]) ||
      menuItem.image ||
      '/Logo.jpg';

    const newOrder = {
      itemId: String(menuItem._id),
      itemName: menuItem.itemName || menuItem.name || 'Pizza Item',
      itemImage: primaryImage,
      price: Number(menuItem.price || 0),
      vendorId: vendorIdStr,
      vendorName:
        menuItem.businessName || menuItem.vendorName || 'PizzaHub Kitchen',
      customerId: customerIdStr,
      customerName: customerName || dbUser?.name || 'Customer',
      customerEmail: customerEmail || dbUser?.email || '',
      deliveryDate: normalizedDate,
      deliveryAddress: String(deliveryAddress).trim(),
      message: String(message || '').trim(),
      status: 'pending',
      createdAt: new Date(),
    };

    const insertResult = await ordersCollection.insertOne(newOrder);

    res.status(201).json({
      message: 'Order placed successfully.',
      orderId: insertResult.insertedId,
      order: {
        ...newOrder,
        _id: insertResult.insertedId,
      },
    });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ message: 'Failed to place order.' });
  }
});

// GET /api/orders/customer — Get logged-in customer's orders
app.get('/api/orders/customer', async (req, res) => {
  try {
    const customerId = String(req.query.customerId || '').trim();

    if (!customerId) {
      return res.status(401).json({ message: 'customerId is required.' });
    }

    const orders = await ordersCollection
      .find({ customerId })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(orders);
  } catch (err) {
    console.error('Error fetching customer orders:', err);
    res.status(500).json({ message: 'Failed to load customer orders.' });
  }
});

// PATCH /api/orders/:id/cancel — Customer cancels own pending order only
app.patch('/api/orders/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = String(req.body?.customerId || req.query?.customerId || '').trim();

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid order ID.' });
    }

    if (!customerId) {
      return res.status(401).json({ message: 'Customer authentication required.' });
    }

    const order = await ordersCollection.findOne({ _id: new ObjectId(id) });

    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    if (String(order.customerId) !== customerId) {
      return res
        .status(403)
        .json({ message: 'You cannot cancel another customer’s order.' });
    }

    const currentStatus = String(order.status || 'pending').toLowerCase();
    if (currentStatus !== 'pending') {
      return res.status(400).json({
        message: `Cannot cancel an order with status "${currentStatus}". Only pending orders can be cancelled.`,
      });
    }

    await ordersCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
        },
      }
    );

    res.status(200).json({
      message: 'Order cancelled successfully.',
      status: 'cancelled',
    });
  } catch (err) {
    console.error('Error cancelling order:', err);
    res.status(500).json({ message: 'Failed to cancel order.' });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});