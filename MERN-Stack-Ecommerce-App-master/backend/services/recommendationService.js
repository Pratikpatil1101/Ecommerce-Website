const Product = require('../models/product');
const { USD_TO_INR_RATE, toInrAmount } = require('../utils/currency');

const normalizeCategory = value =>
  String(value || '')
    .trim()
    .toLowerCase();

const normalizeBudget = value => {
  const budget = Number(value);
  return Number.isFinite(budget) && budget >= 0 ? budget : null;
};

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildCategoryQuery = category => {
  if (['phone', 'phones', 'mobile', 'mobiles', 'smartphone', 'smartphones'].includes(category)) {
    return {
      $or: [
        { name: /iphone/i },
        { description: /smartphone/i },
        { description: /mobile/i },
        { description: /phone/i },
      ],
    };
  }

  if (['laptop', 'laptops'].includes(category)) {
    return {
      $or: [
        { name: /macbook/i },
        { name: /xps/i },
        { name: /surface/i },
        { name: /gram/i },
        { description: /laptop/i },
      ],
    };
  }

  const exactCategoryRegex = new RegExp(`^${escapeRegex(category)}$`, 'i');

  return {
    category: exactCategoryRegex,
  };
};

const toCatalogBudget = budget => {
  // The UI accepts INR budgets, while this project still stores original
  // catalog prices as USD-like numbers. Convert large INR budgets before
  // querying MongoDB, so budget=100000 means roughly products <= Rs. 100000.
  return budget > 10000 ? budget / USD_TO_INR_RATE : budget;
};

const toPlainProduct = product => ({
  id: product._id,
  _id: product._id,
  name: product.name,
  category: product.category,
  price: product.price,
  priceInr: toInrAmount(product.price),
  rating: product.rating,
  image: product.image,
  brand: product.brand,
  stock: product.stock,
  description: product.description,
});

async function forwardChaining({ category, budget }) {
  const normalizedCategory = normalizeCategory(category);
  const normalizedBudget = normalizeBudget(budget);

  if (!normalizedCategory || normalizedBudget === null) {
    return [];
  }

  const catalogBudget = toCatalogBudget(normalizedBudget);

  // Forward chaining is used here:
  // Start from user facts (category and budget), then apply rules forward
  // to discover products that satisfy those facts.
  const products = await Product.find({
    ...buildCategoryQuery(normalizedCategory),
    price: { $lte: catalogBudget },
  })
    .sort({ price: -1, rating: -1 })
    .lean();

  return products.map(toPlainProduct);
}

async function backwardChaining({ category, budget, limit = 3 }) {
  const normalizedCategory = normalizeCategory(category);
  const normalizedBudget = normalizeBudget(budget);

  if (!normalizedCategory || normalizedBudget === null) {
    return [];
  }

  const catalogBudget = toCatalogBudget(normalizedBudget);

  // Backward chaining is used here:
  // Start from the goal "best product", then check backwards whether each
  // product proves the goal by matching category, price <= budget, and rating.
  const products = await Product.find({
    ...buildCategoryQuery(normalizedCategory),
    price: { $lte: catalogBudget },
  })
    .sort({ rating: -1, price: 1 })
    .limit(limit)
    .lean();

  return products.map(toPlainProduct);
}

module.exports = {
  forwardChaining,
  backwardChaining,
};
