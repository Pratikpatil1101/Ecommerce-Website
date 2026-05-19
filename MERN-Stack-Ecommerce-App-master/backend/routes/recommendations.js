const express = require('express');
const { forwardChaining, backwardChaining } = require('../services/recommendationService');

const router = express.Router();

router.get('/recommend', async (req, res) => {
  try {
    const { category, budget } = req.query;

    if (!category || budget === undefined) {
      return res.status(400).json({
        error: 'category and budget query params are required.',
        example: '/api/recommend?category=electronics&budget=100000',
      });
    }

    const [forwardResults, backwardResults] = await Promise.all([
      forwardChaining({ category, budget }),
      backwardChaining({ category, budget, limit: 3 }),
    ]);

    res.json({
      forwardResults,
      backwardResults,
      backwardGoal: 'best product',
      explanation:
        'Forward chaining filters from your category and budget facts. Backward chaining starts from the goal "best product", then checks category, budget, and highest rating.',
    });
  } catch (error) {
    console.error('Recommendation error:', error);
    res.status(500).json({ error: 'Unable to generate recommendations right now.' });
  }
});

module.exports = router;
