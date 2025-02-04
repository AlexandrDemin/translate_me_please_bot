#!/bin/bash
echo "Build script started"
# Check if /tmp exists, if not create it with correct permissions
if [ ! -d "/tmp" ]; then
    mkdir /tmp
    chmod 777 /tmp
fi

echo "/tmp folder exists"

# Copy ffmpeg to /tmp
cp bin/ffmpeg /tmp/ffmpeg
chmod +x /tmp/ffmpeg

if [ -f "/tmp/ffmpeg" ]; then
    echo "/tmp/ffmpeg exists"
fi

echo "Build script ended"