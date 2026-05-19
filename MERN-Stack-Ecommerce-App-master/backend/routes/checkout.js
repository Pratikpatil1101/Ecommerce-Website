const express = require('express');
const { randomInt } = require('crypto');
const mongoose = require('mongoose');
const axios = require('axios');
const Product = require('../models/product');
const Order = require('../models/order');
const { toInrAmount, toPaise } = require('../utils/currency');

const router = express.Router();

const STATUS_FLOW = Order.STATUS_FLOW || [];

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_demo_key';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'test_secret';

async function buildOrderItems(items) {
  const normalizedItems = [];
  for (const item of items) {
    const productId = item?.productId || item?.id;
    const quantity = Number.isInteger(item?.quantity) && item.quantity > 0 ? item.quantity : 1;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      const error = new Error('Invalid product reference in order payload.');
      error.statusCode = 400;
      throw error;
    }

    normalizedItems.push({
      productId: String(productId),
      quantity,
    });
  }

  const productIds = [...new Set(normalizedItems.map(item => item.productId))];
  const products = await Product.find({ _id: { $in: productIds } }).lean();

  if (products.length !== productIds.length) {
    const error = new Error('One or more products are no longer available.');
    error.statusCode = 400;
    throw error;
  }

  const productMap = new Map(products.map(product => [String(product._id), product]));

  return normalizedItems.map(item => {
    const product = productMap.get(item.productId);
    return {
      productId: product._id,
      name: product.name,
      price: toInrAmount(product.price),
      quantity: item.quantity,
      image: product.image,
    };
  });
}

async function generateOrderNumber() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = `FE-${randomInt(100000, 999999)}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await Order.exists({ orderNumber: candidate });
    if (!exists) {
      return candidate;
    }
  }
  return `FE-${Date.now()}`;
}

/**
 * @swagger
 * /api/checkout/create-order:
 *   post:
 *     summary: Create a new order
 *     description: Creates a new order with the provided details such as items, customer information, and payment details.
 *     tags:
 *       - Orders
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     productId:
 *                       type: string
 *                       description: The unique identifier of the product.
 *                     quantity:
 *                       type: integer
 *                       description: The number of items for this product.
 *               name:
 *                 type: string
 *                 description: Customer's name.
 *               email:
 *                 type: string
 *                 description: Customer's email address.
 *               shippingAddress:
 *                 type: string
 *                 description: Customer's shipping address.
 *               cardNumber:
 *                 type: string
 *                 description: Customer's card number.
 *               cardName:
 *                 type: string
 *                 description: Name on the customer's card.
 *               expiry:
 *                 type: string
 *                 description: Card expiry date in MM/YY format.
 *               cvc:
 *                 type: string
 *                 description: Card CVC.
 *     responses:
 *       201:
 *         description: Order created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 orderNumber:
 *                   type: string
 *                   example: FE-482913
 *                 estimatedDelivery:
 *                   type: string
 *                   format: date-time
 *                 statusHistory:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OrderStatus'
 *                 statusFlow:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OrderStatus'
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       productId:
 *                         type: string
 *                       name:
 *                         type: string
 *                       price:
 *                         type: number
 *                       quantity:
 *                         type: integer
 *                 total:
 *                   type: number
 *                   format: float
 *       400:
 *         description: Bad request - Missing or invalid fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Description of the error.
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Description of the server error.
 */
router.post('/create-order', async (req, res) => {
  try {
    const { items, name, email, shippingAddress, cardNumber, cardName, expiry, cvc, razorpayOrderId } = req.body;

    if (!Array.isArray(items) || !items.length || !name || !email || !shippingAddress || !cardNumber || !cardName || !expiry || !cvc) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const trimmedEmail = String(email).trim();
    const trimmedName = String(name).trim();
    const trimmedAddress = String(shippingAddress).trim();

    if (!trimmedName || !trimmedAddress) {
      return res.status(400).json({ error: 'Name and shipping address are required.' });
    }

    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const sanitizedCardNumber = String(cardNumber).replace(/\s+/g, '');
    const sanitizedExpiry = String(expiry).trim();
    const sanitizedCvc = String(cvc).trim();
    const trimmedCardName = String(cardName).trim();

    if (!trimmedCardName) {
      return res.status(400).json({ error: 'Name on card is required.' });
    }

    if (!/^\d{12,16}$/.test(sanitizedCardNumber)) {
      return res.status(400).json({ error: 'Invalid card number' });
    }

    if (!/^(0[1-9]|1[0-2])\/(?:\d{2}|\d{4})$/.test(sanitizedExpiry)) {
      return res.status(400).json({ error: 'Invalid expiry date' });
    }

    if (!/^\d{3,4}$/.test(sanitizedCvc)) {
      return res.status(400).json({ error: 'Invalid CVC' });
    }

    const orderItems = await buildOrderItems(items);

    const orderTotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const orderNumber = await generateOrderNumber();
    const estimatedDelivery = new Date(Date.now() + randomInt(2, 6) * 24 * 60 * 60 * 1000);

    const order = new Order({
      orderNumber,
      email: trimmedEmail.toLowerCase(),
      name: trimmedName,
      shippingAddress: trimmedAddress,
      items: orderItems,
      total: orderTotal,
      estimatedDelivery,
      paymentProvider: razorpayOrderId ? 'razorpay' : 'demo-card',
      paymentOrderId: razorpayOrderId,
    });

    order.ensureInitialStatus();

    await order.save();

    await new Promise(resolve => setTimeout(resolve, 1200));

    res.status(201).json({
      message: 'Order created successfully!',
      orderNumber,
      estimatedDelivery,
      statusHistory: order.statusHistory,
      statusFlow: STATUS_FLOW,
      items: orderItems,
      total: orderTotal,
      currency: 'INR',
      razorpayOrderId,
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Failed to create order' });
  }
});

router.post('/razorpay-order', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Cart items are required to create a Razorpay order.' });
    }

    const orderItems = await buildOrderItems(items);
    const total = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const amount = toPaise(total);
    const receipt = `fusion_${Date.now()}`;

    // Razorpay expects INR amounts in paise. Catalog prices stay unchanged in MongoDB,
    // so this endpoint converts them to rupees first and then to paise for payment.
    if (RAZORPAY_KEY_ID === 'rzp_test_demo_key' || RAZORPAY_KEY_SECRET === 'test_secret') {
      return res.status(201).json({
        id: `order_demo_${Date.now()}`,
        amount,
        currency: 'INR',
        receipt,
        key: RAZORPAY_KEY_ID,
        demo: true,
      });
    }

    const { data } = await axios.post(
      'https://api.razorpay.com/v1/orders',
      {
        amount,
        currency: 'INR',
        receipt,
      },
      {
        auth: {
          username: RAZORPAY_KEY_ID,
          password: RAZORPAY_KEY_SECRET,
        },
      }
    );

    res.status(201).json({
      id: data.id,
      amount: data.amount,
      currency: data.currency,
      receipt: data.receipt,
      key: RAZORPAY_KEY_ID,
      demo: false,
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error?.response?.data || error);
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Failed to create Razorpay order' });
  }
});

module.exports = router;
