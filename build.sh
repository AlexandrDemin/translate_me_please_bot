#!/bin/bash
# Download and extract ffmpeg
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg.tar.xz
tar xf ffmpeg.tar.xz
mv ffmpeg-*-amd64-static/ffmpeg api/ffmpeg
rm -rf ffmpeg.tar.xz ffmpeg-*-amd64-static/