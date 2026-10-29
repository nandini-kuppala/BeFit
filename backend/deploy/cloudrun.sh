#!/usr/bin/env bash
# Deploy the BeFit API to Google Cloud Run (Mumbai), free tier.
#
# One-time setup (run by hand, in order):
#   1. Install gcloud and sign in:        gcloud auth login
#   2. Create a project and link billing (a card is required even for the free
#      tier; set a budget alert of ~₹100 under Billing → Budgets & alerts).
#   3. gcloud config set project <your-project-id>
#   4. gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
#        artifactregistry.googleapis.com secretmanager.googleapis.com
#   5. Store each secret once (never commit them):
#        printf '%s' "$MONGODB_URI"    | gcloud secrets create mongodb-uri --data-file=-
#        printf '%s' "$JWT_SECRET_KEY" | gcloud secrets create jwt-secret  --data-file=-
#        printf '%s' "$GEMINI_API_KEY" | gcloud secrets create gemini-key  --data-file=-
#        printf '%s' "$USDA_FDC_API_KEY" | gcloud secrets create usda-key  --data-file=-
#        printf '%s' "$SARVAM_API_KEY" | gcloud secrets create sarvam-key  --data-file=-   # optional
#        printf '%s' "$TAVILY_API_KEY" | gcloud secrets create tavily-key  --data-file=-   # optional
#      and let Cloud Run read them:
#        PROJECT_NUMBER=$(gcloud projects describe "$(gcloud config get-value project)" --format='value(projectNumber)')
#        for s in mongodb-uri jwt-secret gemini-key usda-key sarvam-key tavily-key; do
#          gcloud secrets add-iam-policy-binding $s \
#            --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
#            --role=roles/secretmanager.secretAccessor; done
#   6. In MongoDB Atlas → Network Access, allow 0.0.0.0/0 (Cloud Run has no fixed
#      outbound IP on the free tier) and make sure the DB user's password is long.
#
# Then deploy (and re-deploy after every change) with:  ./deploy/cloudrun.sh you@example.com

set -euo pipefail
cd "$(dirname "$0")/.."

ALLOWED_EMAILS="${1:?usage: cloudrun.sh <your-email>[,<other-email>]}"
REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-befit-api}"

SECRETS="MONGODB_URI=mongodb-uri:latest,JWT_SECRET_KEY=jwt-secret:latest,GEMINI_API_KEY=gemini-key:latest,USDA_FDC_API_KEY=usda-key:latest"
for optional in "SARVAM_API_KEY=sarvam-key" "TAVILY_API_KEY=tavily-key"; do
  name="${optional#*=}"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    SECRETS="$SECRETS,${optional}:latest"
  fi
done

# --source builds the Dockerfile with Cloud Build (free tier: 120 build-min/day).
# min-instances=0 scales to zero when idle, which is what keeps it free; the
# first request after a quiet spell takes a few seconds. max-instances caps cost
# if something ever hammers it.
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 2 \
  --cpu 1 \
  --memory 512Mi \
  --cpu-boost \
  --concurrency 40 \
  --timeout 60 \
  --set-secrets "$SECRETS" \
  --set-env-vars "MONGODB_DB=befit,APP_TIMEZONE=Asia/Kolkata,EXPOSE_DOCS=false,ALLOWED_EMAILS=${ALLOWED_EMAILS}"

URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')
echo
echo "Deployed: $URL"
echo "Check it:  curl $URL/health"
echo "Then in the app: Settings → Server → $URL"
