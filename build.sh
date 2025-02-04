#!/bin/bash

# Check if /tmp exists, if not create it with correct permissions
if [ ! -d "/tmp" ]; then
    mkdir /tmp
    chmod 777 /tmp
fi

# Download and extract ffmpeg to /tmp
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o /tmp/ffmpeg.tar.xz
cd /tmp && tar xf ffmpeg.tar.xz
mv /tmp/ffmpeg-*-amd64-static/ffmpeg /tmp/ffmpeg
chmod +x /tmp/ffmpeg
rm -rf /tmp/ffmpeg.tar.xz /tmp/ffmpeg-*-amd64-static/