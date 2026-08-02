document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('licenseForm');
    const issuedTo = document.getElementById('issuedTo');
    const licensedBy = document.getElementById('licensedBy');
    const hardwareId = document.getElementById('hardwareId');
    const duration = document.getElementById('duration');
    const customDate = document.getElementById('customDate');
    const customDateGroup = document.getElementById('customDateGroup');
    const developerControls = document.getElementById('developerControls');
    const titleHeader = document.getElementById('titleHeader');
    const password = document.getElementById('password');

    // OTP Elements
    const otpForm = document.getElementById('otpForm');
    const otp = document.getElementById('otp');
    const btnSubmitOtp = document.getElementById('btnSubmitOtp');
    const spinnerOtp = document.getElementById('spinnerOtp');
    const btnTextOtp = document.getElementById('btnTextOtp');
    const btnCancelOtp = document.getElementById('btnCancelOtp');

    const btnSubmit = document.getElementById('btnSubmit');
    const spinner = document.getElementById('spinner');
    const btnText = document.getElementById('btnText');
    
    const errorBanner = document.getElementById('errorBanner');
    const resultCard = document.getElementById('resultCard');
    const licenseBox = document.getElementById('licenseKeyBox');
    const metaExpiry = document.getElementById('metaExpiry');
    const metaHardware = document.getElementById('metaHardware');
    
    const btnCopy = document.getElementById('btnCopy');
    const copyBtnText = document.getElementById('copyBtnText');

    let activeSessionToken = "";

    // Auto-formatting Device Code (XXXX-XXXX-XXXX-XXXX-XXXX-XXXX)
    hardwareId.addEventListener('input', (e) => {
        let val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        let formatted = [];
        for (let i = 0; i < val.length && i < 24; i += 4) {
            formatted.push(val.substring(i, i + 4));
        }
        e.target.value = formatted.join('-');
    });

    // Limit OTP input to numbers only
    otp.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });

    // Toggle custom date selection
    duration.addEventListener('change', () => {
        if (duration.value === 'custom') {
            customDateGroup.style.display = 'block';
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setMinutes(tomorrow.getMinutes() - tomorrow.getTimezoneOffset());
            customDate.value = tomorrow.toISOString().slice(0, 16);
        } else {
            customDateGroup.style.display = 'none';
        }
    });

    // Developer mode unlock: 10 continuous clicks
    let tapCount = 0;
    let lastTapTime = 0;
    titleHeader.addEventListener('click', () => {
        const now = Date.now();
        if (now - lastTapTime < 1000) {
            tapCount++;
        } else {
            tapCount = 1;
        }
        lastTapTime = now;

        if (tapCount >= 10) {
            developerControls.style.display = 'block';
            developerControls.scrollIntoView({ behavior: 'smooth' });
            tapCount = 0;
        }
    });

    const endpoint = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
        ? 'http://localhost:7071/api/generate-license' 
        : '/api/generate-license';

    // --- PHASE 1: SUBMIT DETAILS & REQUEST OTP ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBanner.style.display = 'none';
        resultCard.style.display = 'none';
        
        const hwVal = hardwareId.value.trim();
        if (hwVal.split('-').length !== 6 || hwVal.replace(/-/g, '').length !== 24) {
            showError("Device Code must be exactly 24 characters in format XXXX-XXXX-XXXX-XXXX-XXXX-XXXX");
            return;
        }

        let durationHours = 24;
        if (developerControls.style.display !== 'none') {
            if (duration.value === 'custom') {
                if (!customDate.value) {
                    showError("Please pick a custom expiration date and time");
                    return;
                }
                const selectedTime = new Date(customDate.value);
                const now = new Date();
                const diffMs = selectedTime - now;
                if (diffMs <= 0) {
                    showError("Custom expiration date and time must be in the future");
                    return;
                }
                const maxDiffMs = 30 * 24 * 60 * 60 * 1000;
                if (diffMs > maxDiffMs) {
                    showError("Custom expiration date cannot exceed 30 days from now");
                    return;
                }
                durationHours = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
            } else {
                durationHours = parseInt(duration.value) || 24;
            }
        }

        setLoading(true);

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    password: password.value.trim(),
                    issued_to: issuedTo.value.trim(),
                    licensed_by: licensedBy.value.trim(),
                    hardware_id: hwVal,
                    duration_hours: durationHours
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to process authentication details.");
            }

            if (data.otp_required) {
                activeSessionToken = data.session_token;
                form.style.display = 'none';
                otpForm.style.display = 'block';
                otp.value = '';
                otp.focus();
            } else {
                throw new Error("Invalid response state from API.");
            }

        } catch (err) {
            showError(err.message);
        } finally {
            setLoading(false);
        }
    });

    // --- PHASE 2: VERIFY OTP AND RENDER LICENSE ---
    otpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBanner.style.display = 'none';

        if (otp.value.length !== 6) {
            showError("OTP code must be exactly 6 digits");
            return;
        }

        setOtpLoading(true);

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    otp: otp.value.trim(),
                    session_token: activeSessionToken
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Verification failed.");
            }

            // Success: Clean and reset state, show license box
            otpForm.style.display = 'none';
            form.style.display = 'block';
            password.value = ''; // Clear secret password

            licenseBox.textContent = data.license_key;
            metaExpiry.textContent = data.expiry_time;
            metaHardware.textContent = data.hardware_id;
            resultCard.style.display = 'block';
            resultCard.scrollIntoView({ behavior: 'smooth' });

        } catch (err) {
            showError(err.message);
        } finally {
            setOtpLoading(false);
        }
    });

    btnCancelOtp.addEventListener('click', () => {
        errorBanner.style.display = 'none';
        otpForm.style.display = 'none';
        form.style.display = 'block';
        activeSessionToken = "";
    });

    btnCopy.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(licenseBox.textContent);
            copyBtnText.textContent = "Copied!";
            btnCopy.style.borderColor = "var(--accent-green)";
            
            setTimeout(() => {
                copyBtnText.textContent = "Copy Key";
                btnCopy.style.borderColor = "var(--border-color)";
            }, 2000);
        } catch (err) {
            console.error("Failed to copy text", err);
        }
    });

    function setLoading(isLoading) {
        if (isLoading) {
            btnSubmit.disabled = true;
            spinner.style.display = 'block';
            btnText.textContent = "Authorizing & Dispatched OTP...";
        } else {
            btnSubmit.disabled = false;
            spinner.style.display = 'none';
            btnText.textContent = "Generate License";
        }
    }

    function setOtpLoading(isLoading) {
        if (isLoading) {
            btnSubmitOtp.disabled = true;
            spinnerOtp.style.display = 'block';
            btnTextOtp.textContent = "Verifying Code...";
        } else {
            btnSubmitOtp.disabled = false;
            spinnerOtp.style.display = 'none';
            btnTextOtp.textContent = "Verify & Generate License";
        }
    }

    function showError(msg) {
        errorBanner.textContent = msg;
        errorBanner.style.display = 'block';
        errorBanner.scrollIntoView({ behavior: 'smooth' });
    }
});
