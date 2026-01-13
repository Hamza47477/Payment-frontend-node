/**
 * N-Genius Payment Integration for Taken Cafe
 * Handles card and Apple Pay payments through Network International (N-Genius)
 */

class NGeniusPaymentHandler {
    constructor(apiBaseUrl = '/api/payment') {
        this.apiBaseUrl = apiBaseUrl;
        this.currentOrder = null;
        this.currentPaymentIntent = null;
        this.hostedPaymentUrl = null;
        this.isProcessing = false;
        
        // DOM elements
        this.orderDetailsDiv = document.getElementById('order-details');
        this.orderTotalSection = document.getElementById('order-total-section');
        this.tipSection = document.getElementById('tip-section');
        this.paymentSection = document.getElementById('payment-section');
        this.ngeniusSection = document.getElementById('ngenius-payment-section');
        this.successSection = document.getElementById('success-section');
        this.errorSection = document.getElementById('error-section');
        this.paymentStatus = document.getElementById('payment-status');
        
        // Tip elements
        this.subtotalSpan = document.getElementById('subtotal');
        this.tipAmountSpan = document.getElementById('tip-amount');
        this.totalAmountSpan = document.getElementById('total-amount');
        this.customTipInput = document.getElementById('custom-tip-input');
        
        this.currentTipPercent = 15;
        this.customTip = 0;
    }
    
    async initialize(orderId) {
        try {
            console.log('🚀 Initializing N-Genius Payment Handler...');
            
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
            
            // Create payment intent with N-Genius
            const paymentData = {
                orderId: this.currentOrder.id,
                amount: this.currentOrder.total_price,
                tipAmount: this.getCurrentTip(),
                currency: 'USD',
                paymentMethod: 'CARD',
                customerEmail: this.currentOrder.customer_email || '',
                customerPhone: this.currentOrder.customer_phone || ''
            };
            
            console.log('💳 Initiating card payment:', paymentData);
            
            const response = await fetch(`${this.apiBaseUrl}`, {
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
            
            // Extract hosted payment URL
            const metadata = JSON.parse(payment.payment_metadata);
            const hostedPaymentUrl = metadata.hosted_payment_url;
            
            if (hostedPaymentUrl) {
                console.log('🔗 Redirecting to N-Genius hosted payment page...');
                this.showStatus('Redirecting to payment page...', 'processing');
                window.location.href = hostedPaymentUrl;
            } else {
                throw new Error('No hosted payment URL returned');
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
            
            // Create payment intent with N-Genius for Apple Pay
            const paymentData = {
                orderId: this.currentOrder.id,
                amount: this.currentOrder.total_price,
                tipAmount: this.getCurrentTip(),
                currency: 'USD',
                paymentMethod: 'APPLE_PAY',
                customerEmail: this.currentOrder.customer_email || '',
                customerPhone: this.currentOrder.customer_phone || ''
            };
            
            console.log('🍎 Initiating Apple Pay payment:', paymentData);
            
            const response = await fetch(`${this.apiBaseUrl}`, {
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
            
            // Extract hosted payment URL
            const metadata = JSON.parse(payment.payment_metadata);
            const hostedPaymentUrl = metadata.hosted_payment_url;
            
            if (hostedPaymentUrl) {
                console.log('🔗 Redirecting to N-Genius Apple Pay page...');
                this.showStatus('Redirecting to Apple Pay...', 'processing');
                window.location.href = hostedPaymentUrl;
            } else {
                throw new Error('No hosted payment URL returned');
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
            this.paymentStatus.textContent = message;
            this.paymentStatus.className = `payment-status ${type}`;
            this.paymentStatus.style.display = 'block';
        }
    }
    
    showError(message) {
        if (this.paymentStatus) this.paymentStatus.style.display = 'none';
        if (this.errorSection) {
            this.errorSection.style.display = 'block';
            const errorMsg = this.errorSection.querySelector('#error-message');
            if (errorMsg) errorMsg.textContent = message;
        }
    }
    
    showSuccess(message) {
        if (this.paymentStatus) this.paymentStatus.style.display = 'none';
        if (this.ngeniusSection) this.ngeniusSection.style.display = 'none';
        if (this.successSection) {
            this.successSection.style.display = 'block';
            const successMsg = this.successSection.querySelector('p');
            if (successMsg) successMsg.textContent = message;
        }
    }
    
    // Check payment status after redirect
    async checkPaymentStatus(paymentId) {
        try {
            console.log('🔍 Checking payment status for:', paymentId);
            
            const response = await fetch(`${this.apiBaseUrl}/${paymentId}`);
            if (!response.ok) throw new Error('Could not fetch payment status');
            
            const payment = await response.json();
            console.log('💰 Payment status:', payment.status);
            
            if (payment.status === 'COMPLETED') {
                this.showSuccess('Payment successful! Your order has been confirmed.');
                return true;
            } else if (payment.status === 'FAILED') {
                this.showError('Payment failed: ' + (payment.error_message || 'Unknown error'));
                return false;
            } else if (payment.status === 'AUTHORIZED') {
                this.showStatus('Payment authorized. Waiting for confirmation...', 'processing');
                return null; // Still pending
            }
            
            return null;
        } catch (error) {
            console.error('Error checking payment status:', error);
            return null;
        }
    }
}

// Auto-initialize if ORDER_ID is available globally
if (typeof ORDER_ID !== 'undefined') {
    const ngeniusHandler = new NGeniusPaymentHandler();
    
    document.addEventListener('DOMContentLoaded', async () => {
        await ngeniusHandler.initialize(ORDER_ID);
        
        // Check for payment redirect status
        const params = new URLSearchParams(window.location.search);
        const paymentId = params.get('payment_id');
        if (paymentId) {
            await ngeniusHandler.checkPaymentStatus(paymentId);
        }
    });
}
