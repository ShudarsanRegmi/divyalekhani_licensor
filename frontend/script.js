document.addEventListener('DOMContentLoaded', () => {
    // 1. Auth Form Elements
    const passwordForm = document.getElementById('passwordForm');
    const password = document.getElementById('password');
    const btnSubmitPassword = document.getElementById('btnSubmitPassword');
    const spinnerPassword = document.getElementById('spinnerPassword');
    const btnTextPassword = document.getElementById('btnTextPassword');

    // 2. OTP Form Elements
    const otpForm = document.getElementById('otpForm');
    const otp = document.getElementById('otp');
    const btnSubmitOtp = document.getElementById('btnSubmitOtp');
    const spinnerOtp = document.getElementById('spinnerOtp');
    const btnTextOtp = document.getElementById('btnTextOtp');
    const btnCancelOtp = document.getElementById('btnCancelOtp');

    // 3. License Generation Form Elements
    const licenseForm = document.getElementById('licenseForm');
    const issuedTo = document.getElementById('issuedTo');
    const licensedBy = document.getElementById('licensedBy');
    const hardwareId = document.getElementById('hardwareId');
    const duration = document.getElementById('duration');
    const customDate = document.getElementById('customDate');
    const customDateGroup = document.getElementById('customDateGroup');
    const developerControls = document.getElementById('developerControls');
    const titleHeader = document.getElementById('titleHeader');
    const btnLockPortal = document.getElementById('btnLockPortal');
    
    const btnSubmit = document.getElementById('btnSubmit');
    const spinner = document.getElementById('spinner');
    const btnText = document.getElementById('btnText');
    
    // UI Panels
    const errorBanner = document.getElementById('errorBanner');
    const resultCard = document.getElementById('resultCard');
    const licenseBox = document.getElementById('licenseKeyBox');
    const metaExpiry = document.getElementById('metaExpiry');
    const metaHardware = document.getElementById('metaHardware');
    
    const btnCopy = document.getElementById('btnCopy');
    const copyBtnText = document.getElementById('copyBtnText');

    let activeSessionToken = "";
    let activeAuthToken = "";

    const endpoint = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
        ? 'http://localhost:7071/api/generate-license' 
        : '/api/generate-license';

    // Helper: Browser-native SHA-256
    async function sha256(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

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

    // --- PHASE 1: SUBMIT SECURITY PASSWORD ---
    passwordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBanner.style.display = 'none';
        
        setPasswordLoading(true);

        const enteredVal = password.value.trim();
        const salt = "DivyaLekhaniSecretSalt123!";
        const hash = await sha256(enteredVal + salt);

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    password: hash
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Authentication failed.");
            }

            if (data.otp_required) {
                activeSessionToken = data.session_token;
                passwordForm.style.display = 'none';
                otpForm.style.display = 'block';
                otp.value = '';
                otp.focus();
            } else {
                throw new Error("Invalid response format.");
            }

        } catch (err) {
            showError(err.message);
        } finally {
            setPasswordLoading(false);
        }
    });

    // --- PHASE 2: VERIFY OTP ---
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
                throw new Error(data.error || "OTP verification failed.");
            }

            if (data.authorized && data.auth_token) {
                activeAuthToken = data.auth_token;
                otpForm.style.display = 'none';
                licenseForm.style.display = 'block';
                
                // Clear fields in generator
                issuedTo.value = "";
                hardwareId.value = "";
                duration.value = "24";
                customDateGroup.style.display = "none";
                developerControls.style.display = "none";
                resultCard.style.display = "none";
            } else {
                throw new Error("Unauthorized access.");
            }

        } catch (err) {
            showError(err.message);
        } finally {
            setOtpLoading(false);
        }
    });

    // --- PHASE 3: GENERATE LICENSE ---
    licenseForm.addEventListener('submit', async (e) => {
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

        setLicenseLoading(true);

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    auth_token: activeAuthToken,
                    issued_to: issuedTo.value.trim(),
                    licensed_by: licensedBy.value.trim(),
                    hardware_id: hwVal,
                    duration_hours: durationHours
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to generate license keys.");
            }

            licenseBox.textContent = data.license_key;
            metaExpiry.textContent = data.expiry_time;
            metaHardware.textContent = data.hardware_id;
            resultCard.style.display = 'block';
            resultCard.scrollIntoView({ behavior: 'smooth' });

        } catch (err) {
            showError(err.message);
        } finally {
            setLicenseLoading(false);
        }
    });

    btnCancelOtp.addEventListener('click', () => {
        errorBanner.style.display = 'none';
        otpForm.style.display = 'none';
        passwordForm.style.display = 'block';
        activeSessionToken = "";
    });

    btnLockPortal.addEventListener('click', () => {
        errorBanner.style.display = 'none';
        resultCard.style.display = 'none';
        licenseForm.style.display = 'none';
        passwordForm.style.display = 'block';
        password.value = "";
        activeAuthToken = "";
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

    function setPasswordLoading(isLoading) {
        if (isLoading) {
            btnSubmitPassword.disabled = true;
            spinnerPassword.style.display = 'block';
            btnTextPassword.textContent = "Validating Password...";
        } else {
            btnSubmitPassword.disabled = false;
            spinnerPassword.style.display = 'none';
            btnTextPassword.textContent = "Authenticate";
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
            btnTextOtp.textContent = "Verify OTP & Unlock Portal";
        }
    }

    function setLicenseLoading(isLoading) {
        if (isLoading) {
            btnSubmit.disabled = true;
            spinner.style.display = 'block';
            btnText.textContent = "Signing & Generating...";
        } else {
            btnSubmit.disabled = false;
            spinner.style.display = 'none';
            btnText.textContent = "Generate License";
        }
    }

    function showError(msg) {
        errorBanner.textContent = msg;
        errorBanner.style.display = 'block';
        errorBanner.scrollIntoView({ behavior: 'smooth' });
    }
});
