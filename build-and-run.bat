@echo off
title Ask Ambernath - Production Local Run
call npm ci
call npm run build
call npm start
