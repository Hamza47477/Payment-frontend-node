// Use live backend API via the Node server proxy
const API_BASE_URL = typeof window.API_BASE_URL === 'string' ? window.API_BASE_URL : '/api/payment';

// Initialize Stripe with live publishable key
const stripe = Stripe('pk_test_51SIqA4Ki3uNg2emjxfkokQEF9VXyUZjAAWo37jbWj9CMi0AhBJprVco0ZK3dIqeDBsvfHY1Ftz8SY1HV9o6xQONH0097lDkUkC');
let elements;
let paymentElement;
let currentOrder = null;
let currentTipPercent = 15; // Default tip
let customTip = 0;
let isUpdatingPayment = false; // Prevents race conditions

// DOM Elements
const orderDetailsDiv = document.getElementById('order-details');
const orderTotalSection = document.getElementById('order-total-section');
const tipSection = document.getElementById('tip-section');
const paymentSection = document.getElementById('payment-section');
const successSection = document.getElementById('success-section');
const errorSection = document.getElementById('error-section');
const paymentStatus = document.getElementById('payment-status');
const subtotalSpan = document.getElementById('subtotal');
const tipAmountSpan = document.getElementById('tip-amount');
const totalAmountSpan = document.getElementById('total-amount');
const customTipInput = document.getElementById('custom-tip-input');

// The single submit button for the new Payment Element
const submitButton = document.getElementById('submit-button');

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Payment Element page...');
    console.log('📦 Order ID:', ORDER_ID);
    
    try {
        await loadOrderDetails();
        setupTipButtons();
        
        // Initialize the Payment Element with the default tip
        await initializePaymentElement();
        
        // Setup the form submit listener
        setupFormListener();
        
    } catch (error) {
        console.error('Initialization error:', error);
        showError('Failed to initialize payment page: ' + error.message);
    }
});

/**
 * Load order details from backend
 */
async function loadOrderDetails() {
    try {
        const response = await fetch(`${API_BASE_URL}/order/${ORDER_ID}`);
        if (!response.ok) throw new Error('Order not found');
        
        currentOrder = await response.json();
        console.log('📋 Order loaded:', currentOrder);
        
        displayOrderDetails();
        updateTotals(false); // Update UI totals, but don't refresh Stripe yet
        
        // Show sections
        tipSection.style.display = 'block';
        paymentSection.style.display = 'block';
        
    } catch (error) {
        console.error('Error loading order:', error);
        orderDetailsDiv.innerHTML = `<div class="error-message">⚠️ Could not load order ${ORDER_ID}</div>`;
        throw error;
    }
}

/**
 * Display order details in UI
 */
function displayOrderDetails() {
    if (!currentOrder || !currentOrder.items) {
        orderDetailsDiv.innerHTML = '<p>No items in order</p>';
        return;
    }
    
    let html = '<div class="order-items">';
    currentOrder.items.forEach(item => {
        html += `
            <div class="order-item">
                <div>
                    <span class="item-name">${item.product_id}</span>
                    <span class="item-quantity">x${item.quantity}</span>
                </div>
                <span class="item-price">$${item.price.toFixed(2)}</span>
            </div>
        `;
    });
    html += '</div>';
    
    orderDetailsDiv.innerHTML = html;
    orderTotalSection.style.display = 'block';
}

/**
 * Setup tip selection buttons
 */
function setupTipButtons() {
    const tipButtons = document.querySelectorAll('.tip-btn');
    
    tipButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            if (isUpdatingPayment) return; // Prevent clicking while loading

            tipButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            currentTipPercent = parseInt(btn.dataset.percent);
            customTipInput.value = '';
            customTip = 0;
            
            updateTotals(true); // True = Trigger Stripe update
        });
    });
    
    // Debounce custom tip input to avoid too many API calls
    let debounceTimer;
    customTipInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const value = parseFloat(e.target.value) || 0;
        customTip = value;
        
        tipButtons.forEach(b => b.classList.remove('active'));
        currentTipPercent = 0;
        
        // Update UI immediately
        const subtotal = currentOrder.total_price;
        const total = subtotal + customTip;
        subtotalSpan.textContent = `$${subtotal.toFixed(2)}`;
        tipAmountSpan.textContent = `$${customTip.toFixed(2)}`;
        totalAmountSpan.textContent = `$${total.toFixed(2)}`;

        // Update Stripe after user stops typing for 500ms
        debounceTimer = setTimeout(() => {
            refreshPaymentIntent();
        }, 800);
    });
}

/**
 * Calculate totals and optionally update Stripe
 */
async function updateTotals(shouldUpdateStripe = false) {
    if (!currentOrder) return;
    
    const subtotal = currentOrder.total_price;
    let tip = customTip > 0 ? customTip : (subtotal * currentTipPercent / 100);
    const total = subtotal + tip;
    
    subtotalSpan.textContent = `$${subtotal.toFixed(2)}`;
    tipAmountSpan.textContent = `$${tip.toFixed(2)}`;
    totalAmountSpan.textContent = `$${total.toFixed(2)}`;

    if (shouldUpdateStripe) {
        await refreshPaymentIntent();
    }
}

/**
 * Helper: Get current calculated tip
 */
function getCurrentTip() {
    if (customTip > 0) return customTip;
    return currentOrder.total_price * currentTipPercent / 100;
}

/**
 * Initialize the Stripe Payment Element
 */
async function initializePaymentElement() {
    try {
        const clientSecret = await createPaymentIntent();

        const appearance = {
            theme: 'stripe',
            variables: {
                colorPrimary: '#5469d4',
            },
        };

        // Initialize Elements with the secret
        elements = stripe.elements({ appearance, clientSecret });

        // Create the Payment Element (Handles Apple Pay, Google Pay, Cards)
        paymentElement = elements.create('payment', {
            layout: 'tabs'
        });

        paymentElement.mount('#payment-element');
        console.log('✅ Payment Element mounted');

    } catch (error) {
        console.error('Error initializing Stripe:', error);
        showError('Failed to load payment form: ' + error.message);
    }
}

/**
 * Fetch a new Client Secret from backend
 */
async function createPaymentIntent() {
    const response = await fetch(`${API_BASE_URL}/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            orderId: ORDER_ID,
            currency: 'USD',
            tipAmount: getCurrentTip() // Send current calculated tip
        })
    });
    
    if (!response.ok) throw new Error('Failed to create payment intent');
    const data = await response.json();
    return data.clientSecret;
}

/**
 * Called when Tip Changes:
 * Fetches a new secret with the new amount and updates the element.
 */
async function refreshPaymentIntent() {
    if (!elements) return;

    try {
        isUpdatingPayment = true;
        submitButton.disabled = true;
        submitButton.textContent = 'Updating Total...';
        
        // 1. Get new secret with updated amount
        const newClientSecret = await createPaymentIntent();
        
        // 2. Update the existing elements instance
        elements.fetchUpdates(); // Fetches config updates
        
        // IMPORTANT: In standard Payment Element flow, updating the secret 
        // usually requires updating the elements options.
        // If your library version supports elements.update({ clientSecret }), use it.
        // Otherwise, standard practice is to rely on confirmPayment using the NEW secret 
        // OR simply unmount and remount if the amount change is drastic.
        
        // For simplicity and stability with the Payment Element:
        // We actually just update the 'options' of the elements group
        elements.update({ clientSecret: newClientSecret });

        console.log('✅ Payment Intent updated with new tip');
    } catch (error) {
        console.error('Failed to update amount:', error);
        showError('Failed to update total amount.');
    } finally {
        isUpdatingPayment = false;
        submitButton.disabled = false;
        submitButton.textContent = 'Pay Now';
    }
}

/**
 * Handle the "Pay Now" form submission
 */
async function setupFormListener() {
    const form = document.getElementById('payment-form'); // Ensure your <form> has this ID
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!stripe || !elements) return;

        submitButton.disabled = true;
        submitButton.textContent = 'Processing...';
        showStatus('Processing payment...', 'processing');

        // Confirm the payment
        const { error } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                // Redirect to this page (or a success page) after completion
                return_url: window.location.href, 
                payment_method_data: {
                    billing_details: {
                        // You can pre-fill details here if you have them
                    }
                }
            },
        });

        // This code only runs if an error occurred immediately (e.g., card declined).
        // If success, the page redirects to 'return_url'.
        if (error) {
            console.error('Payment error:', error);
            showError(error.message);
            submitButton.disabled = false;
            submitButton.textContent = 'Pay Now';
        }
    });
}

/**
 * Show payment status message
 */
function showStatus(message, type = 'processing') {
    paymentStatus.textContent = message;
    paymentStatus.className = `payment-status ${type}`;
    paymentStatus.style.display = 'block';
}

/**
 * Show error screen
 */
function showError(message) {
    paymentStatus.style.display = 'none';
    errorSection.style.display = 'block';
    document.getElementById('error-message').textContent = message;
}

// NOTE: checkPaymentStatus logic (for after redirect) would typically go here
// checking new URLSearchParams(window.location.search).get('payment_intent_client_secret')