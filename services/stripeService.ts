
/**
 * STRIPE CONFIGURATION
 * 
 * 1. Create a Payment Link in Stripe Dashboard (Products > Create Payment Link).
 * 2. Set the "After payment" redirect to: https://your-app-url.com?payment=success
 * 3. Paste the `buy.stripe.com` link below.
 */

// Live Stripe Link
export const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/9B6aEP3ZVdvBd6ndYM0Jq00"; 

export const startCheckout = () => {
    // Open Stripe in a new tab or same tab
    window.location.href = STRIPE_PAYMENT_LINK;
};
