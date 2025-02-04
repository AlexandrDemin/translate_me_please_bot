#!/bin/bash

# Check if /tmp exists, if not create it with correct permissions
if [ ! -d "/tmp" ]; then
    mkdir /tmp
    chmod 777 /tmp
fi

# Copy ffmpeg to /tmp
cp bin/ffmpeg /tmp/ffmpeg
chmod +x /tmp/ffmpeg