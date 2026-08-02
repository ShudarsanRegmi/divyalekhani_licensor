document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('licenseForm');
    const issuedTo = document.getElementById('issuedTo');
    const licensedBy = document.getElementById('licensedBy');
    const hardwareId = document.getElementById('hardwareId');
    const duration = document.getElementById('duration');
    
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

    // Auto-formatting Device Code (XXXX-XXXX-XXXX-XXXX-XXXX-XXXX)
    hardwareId.addEventListener('input', (e) => {
        let val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        let formatted = [];
        for (let i = 0; i < val.length && i < 24; i += 4) {
            formatted.push(val.substring(i, i + 4));
        }
        e.target.value = formatted.join('-');
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Hide previous success or error states
        errorBanner.style.display = 'none';
        resultCard.style.display = 'none';
        
        // Validation check
        const hwVal = hardwareId.value.trim();
        if (hwVal.split('-').length !== 6 || hwVal.replace(/-/g, '').length !== 24) {
            showError("Device Code must be exactly 24 characters in format XXXX-XXXX-XXXX-XXXX-XXXX-XXXX");
            return;
        }

        // Set Loading State
        setLoading(true);

        // API Endpoint mapping
        // SWA resolves "/api/..." natively to functions if mapped together
        const endpoint = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
            ? 'http://localhost:7071/api/generate-license' 
            : '/api/generate-license';

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    issued_to: issuedTo.value.trim(),
                    licensed_by: licensedBy.value.trim(),
                    hardware_id: hwVal,
                    duration_hours: parseInt(duration.value)
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to generate license keys.");
            }

            // Populate and Show Result
            licenseBox.textContent = data.license_key;
            metaExpiry.textContent = data.expiry_time;
            metaHardware.textContent = data.hardware_id;
            resultCard.style.display = 'block';
            
            // Scroll to the bottom of the container
            resultCard.scrollIntoView({ behavior: 'smooth' });

        } catch (err) {
            showError(err.message);
        } finally {
            setLoading(false);
        }
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
