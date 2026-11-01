#!/bin/sh
# Upload the game to an S3 bucket.
# Usage: ./deploy.sh my-bucket-name
set -e
if [ -z "$1" ]; then
  echo "Usage: ./deploy.sh BUCKET"
  exit 1
fi
cd "$(dirname "$0")"
aws s3 sync . "s3://$1" --exclude ".git/*" --exclude "deploy.sh"
