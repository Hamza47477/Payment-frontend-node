/**
 * N-Genius Payment Integration for Taken Cafe
 * Handles card and Apple Pay payments through Network International (N-Genius)
 * Version: 2.0 - Production Ready
 */

class NGeniusPaymentHandler {
    constructor(apiBaseUrl = '/api/payments') {
        this.apiBaseUrl = apiBaseUrl;
        this.currentOrder = null;
        this.currentPaymentIntent = null;
        this.hostedPaymentUrl = null;
        this.isProcessing = false;
        
        // DOM elements - will be initialized in init
        this.orderDetailsDiv = null;
        this.orderTotalSection = null;
        this.tipSection = null;
        this.paymentSection = null;
        this.successSection = null;
        this.errorSection = null;
        this.paymentStatus = null;
        
        // Tip elements
        this.subtotalSpan = null;
        this.tipAmountSpan = null;
        this.totalAmountSpan = null;
        this.customTipInput = null;
        
        this.currentTipPercent = 15;
        this.customTip = 0;
    }
    
    initializeElements() {
        // Initialize DOM elements
        this.orderDetailsDiv = document.getElementById('order-details');
        this.orderTotalSection = document.getElementById('order-total-section');
        this.tipSection = document.getElementById('tip-section');
        this.paymentSection = document.getElementById('payment-section');
        this.successSection = document.getElementById('success-section');
        this.errorSection = document.getElementById('error-section');
        this.paymentStatus = document.getElementById('payment-status');
        
        this.subtotalSpan = document.getElementById('subtotal');
        this.tipAmountSpan = document.getElementById('tip-amount');
        this.totalAmountSpan = document.getElementById('total-amount');
        this.customTipInput = document.getElementById('custom-tip-input');
    }
    
    async initialize(orderId) {
        try {
            console.log('🚀 Initializing N-Genius Payment Handler...');
            
            // Initialize DOM elements first
            this.initializeElements();
            
            // Load order details
            await this.loadOrderDetails(orderId);
            
            // Setup UI
            this.setupTipButtons();
            this.setupPaymentMethods();
            
            console.log('✅ N-Genius Payment Handler initialized');
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Failed to initialize payment page: ' + error.message);
        }
    }
    
    async loadOrderDetails(orderId) {
        try {
            // Use public endpoint (no auth required)
            const response = await fetch(`${this.apiBaseUrl}/public/order/${orderId}`);
            if (!response.ok) throw new Error('Order not found');
            
            this.currentOrder = await response.json();
            console.log('📋 Order loaded:', this.currentOrder);
            
            this.displayOrderDetails();
            this.updateTotals(false);
            
            // Show sections
            if (this.tipSection) this.tipSection.style.display = 'block';
            if (this.paymentSection) this.paymentSection.style.display = 'block';
            
        } catch (error) {
            console.error('Error loading order:', error);
            if (this.orderDetailsDiv) {
                this.orderDetailsDiv.innerHTML = `<div class="error-message">⚠️ Could not load order ${orderId}</div>`;
            }
            throw error;
        }
    }
    
    displayOrderDetails() {
        if (!this.currentOrder || !this.currentOrder.items) {
            if (this.orderDetailsDiv) this.orderDetailsDiv.innerHTML = '<p>No items in order</p>';
            return;
        }
        
        let html = '<div class="order-items">';
        this.currentOrder.items.forEach(item => {
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
        
        if (this.orderDetailsDiv) this.orderDetailsDiv.innerHTML = html;
        if (this.orderTotalSection) this.orderTotalSection.style.display = 'block';
    }
    
    setupTipButtons() {
        const tipButtons = document.querySelectorAll('.tip-btn');
        
        tipButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.isProcessing) return;
                
                tipButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                this.currentTipPercent = parseInt(btn.dataset.percent);
                if (this.customTipInput) this.customTipInput.value = '';
                this.customTip = 0;
                
                this.updateTotals(false);
            });
        });
        
        // Custom tip input
        if (this.customTipInput) {
            let debounceTimer;
            this.customTipInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                const value = parseFloat(e.target.value) || 0;
                this.customTip = value;
                
                tipButtons.forEach(b => b.classList.remove('active'));
                this.currentTipPercent = 0;
                
                this.updateTotals(false);
            });
        }
    }
    
    setupPaymentMethods() {
        // Card payment button
        const cardBtn = document.getElementById('pay-with-card-ngenius');
        if (cardBtn) {
            cardBtn.addEventListener('click', () => this.initiateCardPayment());
        }
        
        // Apple Pay button
        const applePayBtn = document.getElementById('pay-with-applepay-ngenius');
        if (applePayBtn && this.supportsApplePay()) {
            applePayBtn.addEventListener('click', () => this.initiateApplePayPayment());
        } else if (applePayBtn) {
            applePayBtn.style.display = 'none';
        }
    }
    
    supportsApplePay() {
        return window.ApplePaySession && ApplePaySession.canMakePayments();
    }
    
    getCurrentTip() {
        if (this.customTip > 0) return this.customTip;
        return this.currentOrder.total_price * this.currentTipPercent / 100;
    }
    
    updateTotals(shouldUpdateBackend = false) {
        if (!this.currentOrder) return;
        
        const subtotal = this.currentOrder.total_price;
        let tip = this.getCurrentTip();
        const total = subtotal + tip;
        
        if (this.subtotalSpan) this.subtotalSpan.textContent = `$${subtotal.toFixed(2)}`;
        if (this.tipAmountSpan) this.tipAmountSpan.textContent = `$${tip.toFixed(2)}`;
        if (this.totalAmountSpan) this.totalAmountSpan.textContent = `$${total.toFixed(2)}`;
    }
    
    async initiateCardPayment() {
        try {
            if (this.isProcessing) return;
            this.isProcessing = true;
            
            const cardBtn = document.getElementById('pay-with-card-ngenius');
            if (cardBtn) cardBtn.disabled = true;
            
            this.showStatus('Creating payment order...', 'processing');
            
            // Create payment with N-Genius
            const paymentData = {
                order_id: this.currentOrder.id,
                payment_method: 'card',
                amount: this.currentOrder.total_price,
                tip_amount: this.getCurrentTip(),
                currency: 'USD',  // Use USD for database compatibility (N-Genius will convert)
                customer_email: this.currentOrder.customer_email || 'customer@takencafe.com',
                customer_phone: this.currentOrder.customer_phone || ''
            };
            
            console.log('💳 Initiating card payment:', paymentData);
            
            const response = await fetch(this.apiBaseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(paymentData)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Payment creation failed');
            }
            
            const payment = await response.json();
            console.log('✅ Payment created:', payment);
            console.log('🔍 Full payment response structure:', JSON.stringify(payment, null, 2));
            console.log('🔍 hosted_payment_url value:', payment.hosted_payment_url);
            console.log('🔍 typeof hosted_payment_url:', typeof payment.hosted_payment_url);
            
            // Get hosted payment URL directly from response
            const hostedPaymentUrl = payment.hosted_payment_url;
            
            if (hostedPaymentUrl) {
                console.log('🔗 Redirecting to N-Genius hosted payment page...');
                this.showStatus('Redirecting to payment page...', 'processing');
                
                // Add payment ID to redirect URL for status checking on return
                const returnUrl = new URL(window.location.href);
                returnUrl.searchParams.set('payment_id', payment.payment_id);
                
                // Redirect to N-Genius
                window.location.href = hostedPaymentUrl;
            } else {
                throw new Error('No hosted payment URL returned from server');
            }
            
        } catch (error) {
            console.error('Card payment error:', error);
            this.showError('Card payment failed: ' + error.message);
            this.isProcessing = false;
            const cardBtn = document.getElementById('pay-with-card-ngenius');
            if (cardBtn) cardBtn.disabled = false;
        }
    }
    
    async initiateApplePayPayment() {
        try {
            if (this.isProcessing) return;
            this.isProcessing = true;
            
            const applePayBtn = document.getElementById('pay-with-applepay-ngenius');
            if (applePayBtn) applePayBtn.disabled = true;
            
            this.showStatus('Creating Apple Pay payment order...', 'processing');
            
            // Create payment with N-Genius for Apple Pay
            const paymentData = {
                order_id: this.currentOrder.id,
                payment_method: 'apple_pay',
                amount: this.currentOrder.total_price,
                tip_amount: this.getCurrentTip(),
                currency: 'USD',  // Use USD for database compatibility (N-Genius will convert)
                customer_email: this.currentOrder.customer_email || 'customer@takencafe.com',
                customer_phone: this.currentOrder.customer_phone || ''
            };
            
            console.log('🍎 Initiating Apple Pay payment:', paymentData);
            
            const response = await fetch(this.apiBaseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(paymentData)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Payment creation failed');
            }
            
            const payment = await response.json();
            console.log('✅ Apple Pay payment created:', payment);
            console.log('🔍 Full payment response structure:', JSON.stringify(payment, null, 2));
            console.log('🔍 hosted_payment_url value:', payment.hosted_payment_url);
            console.log('🔍 typeof hosted_payment_url:', typeof payment.hosted_payment_url);
            
            // Get hosted payment URL directly from response
            const hostedPaymentUrl = payment.hosted_payment_url;
            
            if (hostedPaymentUrl) {
                console.log('🔗 Redirecting to N-Genius Apple Pay page...');
                this.showStatus('Redirecting to Apple Pay...', 'processing');
                
                // Add payment ID to redirect URL for status checking on return
                const returnUrl = new URL(window.location.href);
                returnUrl.searchParams.set('payment_id', payment.payment_id);
                
                // Redirect to N-Genius
                window.location.href = hostedPaymentUrl;
            } else {
                throw new Error('No hosted payment URL returned from server');
            }
            
        } catch (error) {
            console.error('Apple Pay error:', error);
            this.showError('Apple Pay failed: ' + error.message);
            this.isProcessing = false;
            const applePayBtn = document.getElementById('pay-with-applepay-ngenius');
            if (applePayBtn) applePayBtn.disabled = false;
        }
    }
    
    showStatus(message, type = 'processing') {
        if (this.paymentStatus) {
            this.paymentStatus.innerHTML = type === 'processing' 
                ? `<div class="spinner"></div>${message}` 
                : message;
            this.paymentStatus.className = `payment-status ${type}`;
            this.paymentStatus.style.display = 'block';
        }
    }
    
    showError(message) {
        console.error('💥 Error:', message);
        if (this.paymentStatus) this.paymentStatus.style.display = 'none';
        if (this.errorSection) {
            this.errorSection.style.display = 'block';
            const errorMsg = this.errorSection.querySelector('#error-message');
            if (errorMsg) errorMsg.textContent = message;
        }
        
        // Hide checkout view
        const checkoutView = document.getElementById('checkout-view');
        if (checkoutView) checkoutView.style.display = 'none';
    }
    
    showSuccess(message, paymentDetails = null) {
        console.log('✅ Success:', message);
        if (this.paymentStatus) this.paymentStatus.style.display = 'none';
        
        // Hide checkout view
        const checkoutView = document.getElementById('checkout-view');
        if (checkoutView) checkoutView.style.display = 'none';
        
        if (this.successSection) {
            this.successSection.style.display = 'block';
            const successMsg = this.successSection.querySelector('p');
            if (successMsg) successMsg.textContent = message;
            
            if (paymentDetails) {
                const receiptInfo = document.getElementById('receipt-info');
                if (receiptInfo) {
                    receiptInfo.innerHTML = `
                        Payment ID: ${paymentDetails.payment_id || 'N/A'}<br>
                        Amount: ${paymentDetails.currency || 'AED'} ${paymentDetails.total_amount || '0.00'}
                    `;
                }
            }
        }
    }
    
    // Check payment status after redirect from N-Genius
    async checkPaymentStatus(paymentId) {
        try {
            console.log('🔍 Checking payment status for:', paymentId);
            this.showStatus('Verifying payment...', 'processing');
            
            const response = await fetch(`${this.apiBaseUrl}/public/payment/${paymentId}`);
            if (!response.ok) {
                throw new Error('Could not fetch payment status');
            }
            
            const payment = await response.json();
            console.log('💰 Payment status:', payment);
            
            if (payment.status === 'completed' || payment.status === 'COMPLETED') {
                this.showSuccess('Payment successful! Your order has been confirmed.', payment);
                return true;
            } else if (payment.status === 'failed' || payment.status === 'FAILED') {
                this.showError('Payment failed: ' + (payment.error_message || 'Unknown error'));
                return false;
            } else if (payment.status === 'authorized' || payment.status === 'AUTHORIZED') {
                // For N-Genius, authorized means payment is pending capture
                this.showStatus('Payment authorized. Processing...', 'processing');
                
                // Try to capture the payment
                await this.capturePayment(paymentId);
                return null;
            } else {
                this.showStatus(`Payment status: ${payment.status}`, 'processing');
                return null;
            }
            
        } catch (error) {
            console.error('Error checking payment status:', error);
            this.showError('Could not verify payment status. Please contact support.');
            return null;
        }
    }
    
    // Capture authorized payment
    async capturePayment(paymentId) {
        try {
            console.log('💰 Capturing payment:', paymentId);
            
            const response = await fetch(`${this.apiBaseUrl}/${paymentId}/capture`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            
            if (!response.ok) {
                throw new Error('Payment capture failed');
            }
            
            const result = await response.json();
            console.log('✅ Payment captured:', result);
            
            if (result.status === 'completed' || result.status === 'COMPLETED') {
                this.showSuccess('Payment completed successfully!', result);
            } else {
                this.showStatus('Payment is being processed...', 'processing');
            }
            
        } catch (error) {
            console.error('Error capturing payment:', error);
            this.showError('Payment capture failed. Please contact support.');
        }
    }
    
    // Check payment by order reference (N-Genius ref param)
    async checkPaymentByOrderRef(orderRef) {
        try {
            console.log('🔍 Checking payment by order ref:', orderRef);
            this.showStatus('Verifying payment...', 'processing');
            
            // Query backend for payment by provider_transaction_id
            const response = await fetch(`${this.apiBaseUrl}?provider_transaction_id=${orderRef}`);
            if (!response.ok) {
                throw new Error('Could not fetch payment by order ref');
            }
            
            const payments = await response.json();
            if (payments && payments.length > 0) {
                const payment = payments[0];
                await this.checkPaymentStatus(payment.payment_id);
            } else {
                this.showError('Payment not found');
            }
            
        } catch (error) {
            console.error('Error checking payment by ref:', error);
            this.showError('Could not verify payment. Please contact support.');
        }
    }
}

// Auto-initialize if ORDER_ID is available globally
if (typeof ORDER_ID !== 'undefined' && typeof window !== 'undefined') {
    window.ngeniusHandler = new NGeniusPaymentHandler();
    
    document.addEventListener('DOMContentLoaded', async () => {
        await window.ngeniusHandler.initialize(ORDER_ID);
        
        // Check for payment redirect status
        const params = new URLSearchParams(window.location.search);
        const paymentId = params.get('payment_id');
        const orderRef = params.get('ref');
        
        if (paymentId) {
            await window.ngeniusHandler.checkPaymentStatus(paymentId);
        } else if (orderRef) {
            await window.ngeniusHandler.checkPaymentByOrderRef(orderRef);
        }
    });
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NGeniusPaymentHandler;
}
