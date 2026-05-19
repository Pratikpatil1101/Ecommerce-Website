export const USD_TO_INR_RATE = Number(process.env.REACT_APP_USD_TO_INR_RATE || 83);

export const toInrAmount = price => Math.round(Number(price || 0) * USD_TO_INR_RATE);

export const formatINR = price =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(toInrAmount(price));
