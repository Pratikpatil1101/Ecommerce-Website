import * as React from 'react';
import {
  Grid,
  Typography,
  Container,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Pagination,
  CircularProgress,
  Alert,
  Chip,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
  Divider,
  Button,
  TextField,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import SortIcon from '@mui/icons-material/Sort';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import RecommendIcon from '@mui/icons-material/Recommend';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import ProductCard from '../components/ProductCard';
import '../App.css';
import { useNotifier } from '../context/NotificationProvider';
import { apiClient, withRetry } from '../services/apiClient';

const itemsPerPage = 6;

function Shop({ products, addToCart, loading, error }) {
  const [categoryFilter, setCategoryFilter] = React.useState('all');
  const [viewFilter, setViewFilter] = React.useState('all');
  const [page, setPage] = React.useState(1);
  const [animatedCards, setAnimatedCards] = React.useState([]);
  const [sortOption, setSortOption] = React.useState('featured');
  const [recommendCategory, setRecommendCategory] = React.useState('phone');
  const [recommendBudget, setRecommendBudget] = React.useState('20000');
  const [ruleResults, setRuleResults] = React.useState([]);
  const [ruleSummary, setRuleSummary] = React.useState('');
  const [ruleLoading, setRuleLoading] = React.useState(false);
  const { notify } = useNotifier();

  const capitalizeCategory = React.useCallback(category => (category ? category.charAt(0).toUpperCase() + category.slice(1) : ''), []);

  const uniqueCategories = React.useMemo(() => {
    const bucket = new Set();
    products.forEach(product => {
      if (product?.category) {
        bucket.add(capitalizeCategory(product.category));
      }
    });
    return Array.from(bucket).sort();
  }, [products, capitalizeCategory]);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const categoryParam = params.get('category');
    if (categoryParam) {
      const formatted = capitalizeCategory(categoryParam);
      if (formatted && (formatted === 'All' || uniqueCategories.includes(formatted))) {
        setCategoryFilter(formatted === 'All' ? 'all' : formatted);
        setPage(1);
      }
    }
  }, [uniqueCategories, capitalizeCategory]);

  const filteredProducts = React.useMemo(() => {
    const base = categoryFilter === 'all' ? products : products.filter(product => capitalizeCategory(product.category) === categoryFilter);

    const sorted = [...base].sort((a, b) => {
      switch (sortOption) {
        case 'priceLow':
          return (a.price || 0) - (b.price || 0);
        case 'priceHigh':
          return (b.price || 0) - (a.price || 0);
        case 'rating':
          return (b.rating || 0) - (a.rating || 0);
        case 'newest':
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        default:
          return 0;
      }
    });

    if (viewFilter === 'inStock') {
      return sorted.filter(product => typeof product.stock === 'number' && product.stock > 0);
    }
    if (viewFilter === 'featured') {
      return sorted.filter(product => product.isFeatured || (product.rating || 0) >= 4.5);
    }
    return sorted;
  }, [products, categoryFilter, sortOption, viewFilter, capitalizeCategory]);

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const productsToShow = filteredProducts.slice(startIndex, endIndex);
  const showingRuleResults = Boolean(ruleSummary);
  const activeProducts = showingRuleResults ? ruleResults : productsToShow;

  const handlePageChange = (_event, value) => {
    setPage(value);
    setAnimatedCards([]);
  };

  const handleCategoryChange = event => {
    setCategoryFilter(event.target.value);
    setPage(1);
    setAnimatedCards([]);
  };

  const handleSortChange = event => {
    setSortOption(event.target.value);
    setPage(1);
  };

  const handleViewChange = (_event, nextView) => {
    if (nextView !== null) {
      setViewFilter(nextView);
      setPage(1);
    }
  };

  const handleQuickSelect = category => {
    setCategoryFilter(category);
    setPage(1);
    notify({ severity: 'info', message: `Showing ${category === 'all' ? 'all' : category} products` });
  };

  const handleRecommend = async () => {
    setRuleLoading(true);
    try {
      const { data } = await withRetry(() =>
        apiClient.get('recommend', {
          params: {
            category: recommendCategory,
            budget: Number(recommendBudget),
          },
        })
      );
      const results = Array.isArray(data.forwardResults) ? data.forwardResults : [];
      setRuleResults(results);
      setRuleSummary('Forward chaining results');
      notify({ severity: 'success', message: `${results.length} recommendation(s) found.` });
    } catch (err) {
      console.error('Recommendation error:', err);
      notify({ severity: 'error', message: err?.response?.data?.error || 'Unable to fetch recommendations.' });
    } finally {
      setRuleLoading(false);
    }
  };

  const handleGamingLaptopSearch = async () => {
    setRuleLoading(true);
    try {
      const { data } = await withRetry(() =>
        apiClient.get('recommend', {
          params: {
            category: 'laptop',
            budget: Number(recommendBudget) || 100000,
          },
        })
      );
      const results = Array.isArray(data.backwardResults) ? data.backwardResults : [];
      setRuleResults(results);
      setRuleSummary('Backward chaining: best laptop products');
      notify({ severity: 'success', message: `${results.length} best product match(es) found.` });
    } catch (err) {
      console.error('Smart search error:', err);
      notify({ severity: 'error', message: err?.response?.data?.error || 'Unable to run smart search.' });
    } finally {
      setRuleLoading(false);
    }
  };

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedCards(productsToShow.map((_, index) => index));
    }, 100);

    return () => clearTimeout(timer);
  }, [productsToShow]);

  if (loading) {
    return (
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ pb: 8 }}>
      <Paper
        elevation={0}
        sx={{ p: { xs: 3, md: 5 }, borderRadius: 4, mb: 4, background: 'linear-gradient(120deg, rgba(40,116,240,0.12) 0%, rgba(63,81,181,0.08) 100%)' }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              Shop
            </Typography>
            <Typography variant="body1" sx={{ mt: 1, color: 'text.secondary', maxWidth: 520 }}>
              Browse our curated collection of tech essentials. Filter by category, availability, and sort to find your perfect match.
            </Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <ToggleButtonGroup value={viewFilter} exclusive onChange={handleViewChange} size="small">
              <ToggleButton value="all">
                <FilterAltIcon fontSize="small" sx={{ mr: 0.5 }} /> All
              </ToggleButton>
              <ToggleButton value="inStock">In stock</ToggleButton>
              <ToggleButton value="featured">Featured</ToggleButton>
            </ToggleButtonGroup>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="sort-label">
                <SortIcon />
              </InputLabel>
              <Select labelId="sort-label" id="sort-select" value={sortOption} label="Sort" onChange={handleSortChange}>
                <MenuItem value="featured">Featured</MenuItem>
                <MenuItem value="priceLow">Price: Low to High</MenuItem>
                <MenuItem value="priceHigh">Price: High to Low</MenuItem>
                <MenuItem value="rating">Top Rated</MenuItem>
                <MenuItem value="newest">Newest</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Stack>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error.message || 'Unable to load products right now. Please try again shortly.'}
        </Alert>
      )}

      <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, borderRadius: 4, mb: 4 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <TuneIcon color="primary" />
          <Typography variant="subtitle1" fontWeight={700}>
            Quick filters
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label="All" color={categoryFilter === 'all' ? 'primary' : 'default'} onClick={() => handleQuickSelect('all')} />
          {uniqueCategories.map(category => (
            <Chip key={category} label={category} color={categoryFilter === category ? 'primary' : 'default'} onClick={() => handleQuickSelect(category)} />
          ))}
        </Stack>
        <Divider sx={{ my: 2 }} />
        <FormControl fullWidth size="small">
          <InputLabel id="category-filter-label">Filter by Category</InputLabel>
          <Select labelId="category-filter-label" id="category-filter" value={categoryFilter} label="Filter by Category" onChange={handleCategoryChange}>
            <MenuItem value="all">All Categories</MenuItem>
            {uniqueCategories.map(category => (
              <MenuItem key={category} value={category}>
                {category}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Paper>

      <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, borderRadius: 4, mb: 4 }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <RecommendIcon color="primary" />
            <Typography variant="subtitle1" fontWeight={700}>
              Rule-based recommendations
            </Typography>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField size="small" label="Category" value={recommendCategory} onChange={event => setRecommendCategory(event.target.value)} />
            <TextField
              size="small"
              label="Budget in ₹"
              type="number"
              value={recommendBudget}
              onChange={event => setRecommendBudget(event.target.value)}
            />
            <Button variant="contained" startIcon={<RecommendIcon />} onClick={handleRecommend} disabled={ruleLoading}>
              Recommend for me
            </Button>
            <Button variant="outlined" startIcon={<SportsEsportsIcon />} onClick={handleGamingLaptopSearch} disabled={ruleLoading}>
              Find Gaming Laptop
            </Button>
            {showingRuleResults && (
              <Button
                variant="text"
                onClick={() => {
                  setRuleSummary('');
                  setRuleResults([]);
                }}
              >
                Show all products
              </Button>
            )}
          </Stack>
        </Stack>
      </Paper>

      {showingRuleResults && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
            {ruleSummary}
          </Typography>
          {!ruleResults.length && <Alert severity="info">No products matched this rule. Try a higher budget or a different category.</Alert>}
        </Box>
      )}

      <Grid container spacing={3}>
        {activeProducts.map((product, index) => (
          <Grid item key={product.id} xs={12} sm={6} md={4} className={animatedCards.includes(index) ? 'product-card-animated' : ''}>
            <ProductCard product={product} addToCart={addToCart} />
          </Grid>
        ))}
      </Grid>

      {!activeProducts.length && !loading && !showingRuleResults && (
        <Alert severity="info" sx={{ mt: 4 }}>
          No products matched your filters. Try adjusting categories or sorting options.
        </Alert>
      )}

      {!showingRuleResults && pageCount > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, mb: 3 }}>
          <Pagination count={pageCount} page={page} onChange={handlePageChange} color="primary" />
        </Box>
      )}
    </Container>
  );
}

export default Shop;
