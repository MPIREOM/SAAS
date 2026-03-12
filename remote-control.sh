# Remote Control Setup Script
# Run this to set up remote access to your SAAS application

echo "🚀 Setting up Remote Control for SAAS Application"
echo "================================================="

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "📦 Installing ngrok..."
    npm install -g ngrok
fi

# Start the development server
echo "🖥️  Starting development server..."
npm run dev &
SERVER_PID=$!

# Wait for server to start
sleep 5

# Start ngrok tunnel
echo "🌐 Starting ngrok tunnel..."
ngrok http 3000 &
NGROK_PID=$!

# Wait for ngrok to start
sleep 3

# Get ngrok URL
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url')

echo ""
echo "✅ Remote Control Setup Complete!"
echo "=================================="
echo "🌐 Public URL: $NGROK_URL"
echo "📊 Dashboard: $NGROK_URL/remote-control"
echo "📱 QR Generator: $NGROK_URL/qr-code"
echo ""
echo "📋 Available Endpoints:"
echo "  • $NGROK_URL/api/remote-control"
echo "  • $NGROK_URL/api/scan-id"
echo "  • $NGROK_URL/api/qr-code"
echo ""
echo "🛑 To stop: kill $SERVER_PID $NGROK_PID"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for user interrupt
trap "echo '🛑 Stopping services...'; kill $SERVER_PID $NGROK_PID 2>/dev/null; exit" INT
wait