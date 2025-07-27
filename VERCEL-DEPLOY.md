# 🚀 Vercel Deployment Guide

## 📋 Pre-Deployment Checklist

✅ **Code is ready for Vercel**  
✅ **Google Sheets setup completed** (or use development mode)  
✅ **Environment variables prepared**  
✅ **GitHub repository ready**  

## 🔧 Step 1: Prepare Environment Variables

You'll need these environment variables for Vercel:

### Required for Production:
```bash
GOOGLE_CREDENTIALS={"type":"service_account","project_id":"your-project",...}
SHEET_ID=1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S0T
RESUME_URL=https://codesmith17.github.io/resume/resume.pdf
```

### For Development Testing on Vercel:
```bash
NODE_ENV=development
RESUME_URL=https://codesmith17.github.io/resume/resume.pdf
```

## 🚀 Step 2: Deploy to Vercel

### Option A: Using Vercel Dashboard

1. **Push your code to GitHub:**
   ```bash
   git add .
   git commit -m "Ready for Vercel deployment"
   git push origin main
   ```

2. **Go to [vercel.com](https://vercel.com)**

3. **Import your GitHub repository**

4. **Configure Environment Variables:**
   - Go to Project Settings → Environment Variables
   - Add your variables (see above)

5. **Deploy!**

### Option B: Using Vercel CLI

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy from your project directory:**
   ```bash
   vercel
   ```

4. **Set environment variables:**
   ```bash
   vercel env add GOOGLE_CREDENTIALS production
   vercel env add SHEET_ID production
   vercel env add RESUME_URL production
   ```

5. **Redeploy with environment variables:**
   ```bash
   vercel --prod
   ```

## 🎯 Step 3: Test Your Deployment

Once deployed, you'll get a URL like: `https://your-app.vercel.app`

### Test all endpoints:

```bash
# Health check
curl https://your-app.vercel.app/health

# Basic tracking
curl -L https://your-app.vercel.app/track

# Email tracking  
curl -L "https://your-app.vercel.app/track-email?email=test@company.com&source=vercel-test"

# Stats
curl https://your-app.vercel.app/stats
```

### Expected responses:

**Health Check (Production Mode):**
```json
{
  "status": "healthy",
  "mode": "production",
  "googleSheetsEnabled": true,
  "resumeUrl": "https://codesmith17.github.io/resume/resume.pdf"
}
```

**Health Check (Development Mode):**
```json
{
  "status": "healthy",
  "mode": "development", 
  "googleSheetsEnabled": false,
  "resumeUrl": "https://codesmith17.github.io/resume/resume.pdf"
}
```

## 📊 Step 4: Update Your Links

Replace your resume links everywhere with:

**Standard tracking:**
```
https://your-app.vercel.app/track
```

**Email tracking:**
```
https://your-app.vercel.app/track-email?email=THEIR_EMAIL&source=linkedin
```

### Where to use:
- LinkedIn profile resume link
- Email signatures
- Job applications  
- Portfolio websites
- Business cards (QR codes)

## 🔧 Step 5: Configure Custom Domain (Optional)

1. **Buy a domain** (e.g., `yourname-resume.com`)

2. **Add to Vercel:**
   - Project Settings → Domains
   - Add your domain
   - Follow DNS configuration

3. **Update your links:**
   ```
   https://yourname-resume.com/track
   ```

## 📈 Step 6: Monitor Your Tracking

### View logs in Vercel:
```bash
vercel logs your-app-name
```

### Check Google Sheets:
- Open your tracking Google Sheet
- See real-time visitor data
- Analyze email detection rates

### Use stats endpoint:
```bash
curl https://your-app.vercel.app/stats
```

## 🛠️ Troubleshooting

### Common Issues:

**1. "Google Sheets logging failed"**
- Check `GOOGLE_CREDENTIALS` is valid JSON
- Verify service account has access to sheet
- Confirm `SHEET_ID` is correct

**2. "Function timeout"**
- IP geolocation API might be slow
- This is rare and usually resolves itself

**3. "Environment variables not found"**
- Make sure variables are set in Vercel dashboard
- Redeploy after adding variables

**4. "502 Bad Gateway"**
- Check Vercel function logs
- Verify `vercel.json` configuration

### Debug commands:

```bash
# Check logs
vercel logs your-app-name --since=1h

# Test locally with production build
vercel dev

# Check environment variables
vercel env ls
```

## 🎯 Final Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] Vercel project created and deployed
- [ ] Environment variables configured
- [ ] Health endpoint returns 200 OK
- [ ] Tracking endpoints redirect properly
- [ ] Google Sheets receiving data (if enabled)
- [ ] Stats endpoint working
- [ ] Updated resume links everywhere
- [ ] Custom domain configured (optional)

## 📋 Environment Variables Reference

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `GOOGLE_CREDENTIALS` | Production | `{"type":"service_account",...}` | Google service account JSON |
| `SHEET_ID` | Production | `1A2B3C4D5E6F...` | Google Sheet ID |
| `RESUME_URL` | Yes | `https://codesmith17.github.io/resume/resume.pdf` | Your actual resume URL |
| `NODE_ENV` | No | `development` | Force development mode |

## 🚀 You're Ready!

Your resume tracker is now live and tracking all visitors invisibly! Share your new tracking URL instead of your direct resume link, and watch the data flow into your Google Sheets.

**Your tracking URL:** `https://your-app.vercel.app/track`

Every click will be logged with 28 data points including email detection, location, device info, and more! 🎯 