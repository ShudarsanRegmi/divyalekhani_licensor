# Deploying DivyaLekhani License Generator on Azure

This guide explains how to deploy the license generation tool as a secure, production-grade web application using:
1. **Azure Functions (Backend)**: Serverless Python API to sign and generate licenses.
2. **Azure Static Web Apps (Frontend)**: Modern glassmorphic user interface.

```mermaid
graph TD
    User([User Browser]) -->|Loads Frontend| SWA[Azure Static Web App]
    User -->|POST /api/generate-license| Fn[Azure Function]
    Fn -->|Reads Private Key| Env[Environment Variable / App Settings]
    Fn -->|Signs payload| License[Generated License Key]
    License -->|JSON Response| User
```

---

## 1. Project Directory Structure

Create the following structure in a new directory or inside a subfolder of your repository:

```text
divyalekhani-license-manager/
├── backend/
│   ├── host.json
│   ├── local.settings.json
│   ├── requirements.txt
│   └── function_app.py
└── frontend/
    ├── index.html
    └── script.js
```

---

## 2. Backend Implementation (Azure Function)

Azure Functions v2 programming model uses a single `function_app.py` file to declare HTTP routes.

### `backend/requirements.txt`
Dependencies required by the Azure Function.

```text
azure-functions
cryptography
```

### `backend/host.json`
Metadata configuration for the function host.

```json
{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": true,
        "excludedTypes": "Request"
      }
    }
  },
  "extensionBundle": {
    "id": "Microsoft.Azure.Bundles",
    "version": "[4.*, 5.0.0)"
  }
}
```

### `backend/function_app.py`
This script accepts request parameters, parses the private key from the environment variable (`PRIVATE_KEY_PEM`), signs the payload using `cryptography`, and returns the license.

```python
import azure.functions as func
import logging
import json
import base64
import time
import os
from datetime import datetime, timedelta
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import serialization, hashes

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

@app.route(route="generate-license", methods=["POST"])
def generate_license(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Processing license generation request.")

    # CORS preflight handling (if backend is not mapped to SWA api route)
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    }

    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=headers)

    try:
        req_body = req.get_json()
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid JSON body"}),
            status_code=400,
            headers=headers
        )

    issued_to = req_body.get("issued_to", "").strip()
    licensed_by = req_body.get("licensed_by", "Aparichit").strip()
    hardware_id = req_body.get("hardware_id", "").strip().upper()
    duration_hours = int(req_body.get("duration_hours", 24))

    # Basic validations
    if not issued_to:
        return func.HttpResponse(
            json.dumps({"error": "Recipient name ('issued_to') is required"}),
            status_code=400,
            headers=headers
        )
    if not hardware_id:
        return func.HttpResponse(
            json.dumps({"error": "Device Code ('hardware_id') is required"}),
            status_code=400,
            headers=headers
        )

    # 1. Fetch Private Key safely from Application Settings
    private_key_pem = os.environ.get("PRIVATE_KEY_PEM")
    if not private_key_pem:
        return func.HttpResponse(
            json.dumps({"error": "Application Error: Private Key is missing from Environment Settings"}),
            status_code=500,
            headers=headers
        )

    try:
        # Replace literal newline escapes if stored as a single-line string in Azure Settings
        normalized_pem = private_key_pem.replace("\\n", "\n")
        private_key = serialization.load_pem_private_key(
            normalized_pem.encode("utf-8"),
            password=None
        )
    except Exception as e:
        logging.error(f"Error loading private key: {str(e)}")
        return func.HttpResponse(
            json.dumps({"error": "Internal Error: Failed to parse signing keys"}),
            status_code=500,
            headers=headers
        )

    # 2. Expiration duration calculation
    now = datetime.now()
    expiry_time = now + timedelta(hours=duration_hours)
    expiry_epoch_ms = int(time.mktime(expiry_time.timetuple()) * 1000)

    # 3. Create Payload
    payload = {
        "issued_to": issued_to,
        "licensed_by": licensed_by,
        "expiry_ms": expiry_epoch_ms,
        "hardware_id": hardware_id
    }

    # 4. Serialize and Base64Url encode
    payload_str = json.dumps(payload, separators=(',', ':'))
    payload_bytes = payload_str.encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(payload_bytes).decode("utf-8").rstrip("=")

    # 5. Sign using RSA-SHA256
    try:
        signature = private_key.sign(
            payload_b64.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256()
        )
        signature_b64 = base64.urlsafe_b64encode(signature).decode("utf-8").rstrip("=")
        license_key = f"{payload_b64}.{signature_b64}"
    except Exception as e:
        logging.error(f"Error signing payload: {str(e)}")
        return func.HttpResponse(
            json.dumps({"error": "Signing Error: Failed to sign license payload"}),
            status_code=500,
            headers=headers
        )

    # 6. Response
    response_data = {
        "license_key": license_key,
        "issued_to": issued_to,
        "licensed_by": licensed_by,
        "hardware_id": hardware_id,
        "expiry_time": expiry_time.strftime("%Y-%m-%d %H:%M:%S")
    }

    return func.HttpResponse(
        json.dumps(response_data),
        status_code=200,
        headers=headers
    )
```

---

## 3. Frontend Implementation (Azure Static Web App)

Here is a premium glassmorphic dark mode layout using modern CSS variables, subtle gradients, Outfit typography, and custom micro-animations.

### `frontend/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DivyaLekhani - License Generator</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #0b0d19;
            --card-bg: rgba(22, 25, 43, 0.7);
            --border-color: rgba(255, 255, 255, 0.08);
            --accent-green: #39FF14;
            --accent-cyan: #00E5FF;
            --accent-purple: #6C63FF;
            --accent-red: #FF4D4D;
            --text-primary: #FFFFFF;
            --text-secondary: #ABB1CC;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Outfit', sans-serif;
            background-color: var(--bg-color);
            background-image: 
                radial-gradient(circle at 10% 20%, rgba(108, 99, 255, 0.15) 0%, transparent 40%),
                radial-gradient(circle at 90% 80%, rgba(0, 229, 255, 0.15) 0%, transparent 40%);
            color: var(--text-primary);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .container {
            width: 100%;
            max-width: 580px;
            background: var(--card-bg);
            backdrop-filter: blur(16px);
            border: 1px solid var(--border-color);
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
            animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        header {
            text-align: center;
            margin-bottom: 30px;
        }

        header h1 {
            font-size: 2.2rem;
            font-weight: 700;
            background: linear-gradient(135deg, #FFF 30%, var(--accent-cyan));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 8px;
        }

        header p {
            color: var(--text-secondary);
            font-size: 0.95rem;
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            color: var(--text-secondary);
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 600;
        }

        .form-control {
            width: 100%;
            padding: 14px 16px;
            background: rgba(11, 13, 25, 0.5);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            color: var(--text-primary);
            font-family: inherit;
            font-size: 1rem;
            transition: all 0.3s ease;
        }

        .form-control:focus {
            outline: none;
            border-color: var(--accent-cyan);
            box-shadow: 0 0 10px rgba(0, 229, 255, 0.15);
        }

        select.form-control {
            appearance: none;
            background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ABB1CC' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 16px center;
            background-size: 16px;
            cursor: pointer;
        }

        .btn-submit {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            padding: 16px;
            background: linear-gradient(135deg, var(--accent-purple), var(--accent-cyan));
            border: none;
            border-radius: 10px;
            color: #FFFFFF;
            font-size: 1rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(108, 99, 255, 0.3);
            margin-top: 10px;
        }

        .btn-submit:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0, 229, 255, 0.4);
        }

        .btn-submit:active {
            transform: translateY(0);
        }

        .btn-submit:disabled {
            background: rgba(255, 255, 255, 0.05);
            color: rgba(255, 255, 255, 0.3);
            box-shadow: none;
            cursor: not-allowed;
            transform: none;
        }

        /* Result Section */
        .result-card {
            margin-top: 30px;
            border-top: 1px solid var(--border-color);
            padding-top: 25px;
            display: none;
            animation: fadeIn 0.4s ease-out;
        }

        .result-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
        }

        .result-header h2 {
            font-size: 1.1rem;
            color: var(--accent-green);
        }

        .license-box {
            background: rgba(11, 13, 25, 0.8);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            padding: 16px;
            font-family: monospace;
            font-size: 0.85rem;
            word-break: break-all;
            max-height: 150px;
            overflow-y: auto;
            color: var(--text-secondary);
            margin-bottom: 15px;
        }

        .license-meta {
            font-size: 0.85rem;
            color: var(--text-secondary);
            margin-bottom: 20px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            background: rgba(255, 255, 255, 0.02);
            padding: 12px;
            border-radius: 8px;
        }

        .btn-copy {
            background: #22253F;
            border: 1px solid var(--border-color);
            color: #FFFFFF;
            padding: 10px 16px;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }

        .btn-copy:hover {
            background: #2d3154;
            border-color: var(--accent-green);
        }

        /* Error Banner */
        .error-banner {
            background: rgba(255, 77, 77, 0.1);
            border: 1px solid var(--accent-red);
            color: #FF7D7D;
            border-radius: 10px;
            padding: 14px;
            margin-bottom: 20px;
            font-size: 0.9rem;
            display: none;
        }

        /* Spinner */
        .spinner {
            border: 3px solid rgba(255, 255, 255, 0.1);
            width: 20px;
            height: 20px;
            border-radius: 50%;
            border-left-color: #FFFFFF;
            animation: spin 1s linear infinite;
            display: none;
            margin-right: 10px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>

<div class="container">
    <header>
        <h1>DivyaLekhani</h1>
        <p>License Generator Portal</p>
    </header>

    <div class="error-banner" id="errorBanner"></div>

    <form id="licenseForm">
        <div class="form-group">
            <label for="issuedTo">Issued To (Recipient Name)</label>
            <input type="text" id="issuedTo" class="form-control" placeholder="e.g., John Doe" required>
        </div>

        <div class="form-group">
            <label for="licensedBy">Licensed By</label>
            <input type="text" id="licensedBy" class="form-control" value="Aparichit" placeholder="Aparichit" required>
        </div>

        <div class="form-group">
            <label for="hardwareId">Device Code (Hardware ID)</label>
            <input type="text" id="hardwareId" class="form-control" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" required>
        </div>

        <div class="form-group">
            <label for="duration">Expiration Duration</label>
            <select id="duration" class="form-control">
                <option value="24">24 Hours (Trial)</option>
                <option value="720">30 Days (Standard)</option>
                <option value="8760">365 Days (Annual)</option>
                <option value="876000">100 Years (Lifetime)</option>
            </select>
        </div>

        <button type="submit" class="btn-submit" id="btnSubmit">
            <div class="spinner" id="spinner"></div>
            <span id="btnText">Generate License</span>
        </button>
    </form>

    <div class="result-card" id="resultCard">
        <div class="result-header">
            <h2>License Key Generated!</h2>
        </div>
        <div class="license-box" id="licenseKeyBox"></div>
        <div class="license-meta">
            <div><strong>Expires:</strong> <span id="metaExpiry"></span></div>
            <div><strong>Hardware ID:</strong> <span id="metaHardware"></span></div>
        </div>
        <button class="btn-copy" id="btnCopy">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span id="copyBtnText">Copy Key</span>
        </button>
    </div>
</div>

<script src="script.js"></script>
</body>
</html>
```

### `frontend/script.js`
Performs validation, sends request payload to the Azure Function backend, and processes copy states.

```javascript
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
        const endpoint = window.location.origin.includes('localhost') 
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
```

---

## 4. Setup and Local Testing

### Step A: Prerequisites
Ensure you have the following installed locally:
- [Python 3.9, 3.10, or 3.11](https://www.python.org/downloads/)
- [Azure Functions Core Tools](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local)

### Step B: Create Local Environment Settings
Create a `backend/local.settings.json` file. Replace `your_private_key_pem_multiline_string` with the multiline contents of your local `private_key.pem` file.

```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "python",
    "AzureWebJobsStorage": "",
    "PRIVATE_KEY_PEM": "-----BEGIN RSA PRIVATE KEY-----\nMIIEogIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----"
  },
  "Host": {
    "CORS": "*"
  }
}
```

### Step C: Run Locally
1. In a terminal, navigate to the `backend/` directory:
   ```bash
   pip install -r requirements.txt
   func start
   ```
2. The function app will start and show local endpoints like:
   `http://localhost:7071/api/generate-license`
3. Double-click `frontend/index.html` to open it in a browser and test generation locally.

---

## 5. Deployment to Azure

### Method 1: Using the Azure Portal & GitHub (Recommended)
This approach integrates Azure Static Web Apps and Azure Functions natively in a single workflow.

1. **Commit code to GitHub**: Push your `divyalekhani-license-manager` project folder to a GitHub repository.
2. **Create a Static Web App in Azure**:
   - Search for **Static Web Apps** in the Azure Portal and click **Create**.
   - Select your Subscription, Resource Group, and Region.
   - For **Deployment Details**, select **GitHub** and authorize Azure to access your repository.
   - Select your Repository and Branch (`main`).
   - For **Build Presets**, choose **Custom**.
   - Set the following paths:
     - **App location**: `/frontend` (path to your static files)
     - **Api location**: `/backend` (path to your Python function app)
     - **Output location**: `.` (leave empty or dot since we have pure HTML/JS)
3. **Save and Deploy**: Click **Review + Create**. Azure will automatically create a GitHub Actions workflow in your repository and deploy both frontend and backend.

### Method 2: Configure Settings & Keys
Once deployed, you need to store the signing key securely.
1. In the Azure Portal, open your new **Static Web App** (or **Function App** if hosted separately).
2. Go to **Settings** -> **Configuration** (or **Environment Variables**).
3. Add a new Application Setting:
   - **Name**: `PRIVATE_KEY_PEM`
   - **Value**: The full contents of your `private_key.pem` (e.g. `-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----`).
4. Click **Save**. The app will restart and is now fully operational!

---

## 6. Accessing Your New License Site
Your Azure Static Web App provides a public URL (e.g. `https://gray-sand-01234.azurestaticapps.net`).
- Going to that URL loads the beautiful generator page.
- Filling out the form calls the backend function automatically at `https://gray-sand-01234.azurestaticapps.net/api/generate-license`.
- The backend signs using the secure key from the environment variables, never exposing it to the client!
