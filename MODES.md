# 🚀 Running Resume Tracker in Different Modes

## 📊 Available Modes

### 1. Development Mode (Default)
```bash
npm run dev
```

**Features:**
- ✅ No Google Sheets setup required
- ✅ All data logged to console only
- ✅ Auto-reload with nodemon
- ✅ Perfect for testing and development

**When to use:** Testing, development, learning how it works

### 2. Production Mode (Mock Credentials)
```bash
./run-prod-test.sh
```

**Features:**
- ✅ Runs in production mode behavior
- ✅ Attempts Google Sheets API calls (will fail with mock credentials)
- ✅ Shows you exactly how production mode works
- ✅ Auto-reload with nodemon

**When to use:** Testing production behavior without real Google setup

### 3. Production Mode (Real Credentials)
```bash
# Set real environment variables first:
export GOOGLE_CREDENTIALS='{"type":"service_account",...real_credentials...}'
export SHEET_ID="your_real_sheet_id"
export RESUME_URL="https://your-resume-url.com"

npm run dev
```

**Features:**
- ✅ Full production functionality
- ✅ Real Google Sheets integration
- ✅ All 28 data points logged to Google Sheets
- ✅ Auto-reload with nodemon

**When to use:** Final testing before deploying to Vercel

### 4. True Production (No Auto-reload)
```bash
# With real environment variables set:
npm run prod
```

**Features:**
- ✅ Production mode without nodemon
- ✅ No auto-reload (for actual production deployment)
- ✅ Same as what runs on Vercel

**When to use:** Final production testing, or manual server deployment

## 🎯 Quick Comparison

| Command | Mode | Google Sheets | Auto-reload | Use Case |
|---------|------|---------------|-------------|----------|
| `npm run dev` | Development | ❌ Console only | ✅ Yes | Development |
| `./run-prod-test.sh` | Production | ❌ Mock (fails) | ✅ Yes | Test prod behavior |
| `npm run dev` + env vars | Production | ✅ Real | ✅ Yes | Pre-deployment test |
| `npm run prod` + env vars | Production | ✅ Real | ❌ No | True production |

## 🧪 Current Status

**You're currently running:** Production Mode with Mock Credentials

**Health Check Response:**
```json
{
  "status": "healthy",
  "mode": "production", 
  "googleSheetsEnabled": true,
  "resumeUrl": "https://codesmith17.github.io/resume/resume.pdf"
}
```

**What happens when you track:**
- ✅ All tracking logic runs
- ✅ Data collection works (28 fields)
- ✅ Google Sheets API attempts are made
- ❌ API calls fail (mock credentials)
- ✅ User still gets redirected to resume
- ❌ Stats endpoint returns error (can't read sheets)

## 🔧 To Get Real Production Mode

1. **Set up Google Cloud & Sheets** (see README.md)
2. **Replace mock credentials with real ones:**
   ```bash
   export GOOGLE_CREDENTIALS='{"type":"service_account","project_id":"your-real-project",...}'
   export SHEET_ID="1A2B3C4D5E6F7G8H9I0J..."  # Your real Sheet ID
   ```
3. **Restart the server:**
   ```bash
   pkill -f nodemon
   npm run dev
   ```

## 🎯 Testing Different Modes

**Test URLs (works in all modes):**
- Health: http://localhost:3000/health
- Basic tracking: http://localhost:3000/track  
- Email tracking: http://localhost:3000/track-email?email=test@company.com
- Stats: http://localhost:3000/stats

**Expected behavior by mode:**
- **Development:** Console logging, stats show "dev mode"
- **Production (mock):** API attempts, stats show error
- **Production (real):** Google Sheets updates, stats show real data

Your setup is perfect for testing both development and production modes! 🚀 