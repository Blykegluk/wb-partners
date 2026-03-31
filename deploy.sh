#!/bin/bash
# Full deploy script — never 404 again
set -e

echo "📦 Building app..."
npm run build

echo "📋 Assembling deploy folder..."
# Keep landing page + CNAME + logo at root
cp public-site/index.html deploy/index.html
cp public-site/index.html deploy/404.html
cp public-site/logo.png deploy/logo.png 2>/dev/null || true
echo "wbpartners.fr" > deploy/CNAME

# Replace app folder with fresh build
rm -rf deploy/app
cp -r dist/app deploy/app
cp deploy/app/index.html deploy/app/404.html

echo "🚀 Publishing to gh-pages..."
rm -rf node_modules/.cache/gh-pages
npx gh-pages -d deploy

echo "⏳ Triggering GitHub Pages build..."
sleep 5
gh api repos/Blykegluk/wb-partners/pages/builds -X POST

echo "✅ Deployed! Waiting for build..."
sleep 20

# Verify
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://wbpartners.fr/)
APP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://wbpartners.fr/app/)
echo "🌐 wbpartners.fr → $STATUS"
echo "🌐 wbpartners.fr/app/ → $APP_STATUS"

if [ "$STATUS" = "200" ] && [ "$APP_STATUS" = "200" ]; then
  echo "✅ All good!"
else
  echo "⚠️ Retrying build trigger..."
  gh api repos/Blykegluk/wb-partners/pages/builds -X POST
  sleep 20
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://wbpartners.fr/)
  echo "🌐 wbpartners.fr → $STATUS"
fi
