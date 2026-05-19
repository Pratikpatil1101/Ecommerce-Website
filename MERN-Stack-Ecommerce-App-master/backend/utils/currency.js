const USD_TO_INR_RATE = Number(process.env.USD_TO_INR_RATE || 83);

function toInrAmount(price) {
  const numericPrice = Number(price || 0);
  return Math.round(numericPrice * USD_TO_INR_RATE);
}

function toPaise(amountInRupees) {
  return Math.max(100, Math.round(Number(amountInRupees || 0) * 100));
}

module.exports = {
  USD_TO_INR_RATE,
  toInrAmount,
  toPaise,
};
