#!/bin/bash

# Hyperopt Helper Script
# Usage: ./run_hyperopt.sh <StrategyName> [Epochs]

STRATEGY=$1
EPOCHS=${2:-100}

if [ -z "$STRATEGY" ]; then
    echo "Usage: ./run_hyperopt.sh <StrategyName> [Epochs]"
    echo "Available strategies:"
    ls freqtrade/user_data/strategies/*.py | xargs -n 1 basename | sed 's/.py//'
    exit 1
fi

echo "=========================================================="
echo "Starting Hyperopt for $STRATEGY with $EPOCHS epochs..."
echo "=========================================================="

# Ensure freqtrade image is available
# docker pull freqtradeorg/freqtrade:stable > /dev/null

# Run hyperopt in a temporary container
docker run --rm -it \
  -v "$(pwd)/freqtrade/user_data:/freqtrade/user_data" \
  freqtradeorg/freqtrade:stable \
  hyperopt \
  --config /freqtrade/user_data/config.json \
  --strategy "$STRATEGY" \
  --hyperopt-loss SharpeHyperOptLoss \
  --spaces buy sell roi stoplib \
  --epochs "$EPOCHS" \
  --timerange 20240101-

echo "=========================================================="
echo "Hyperopt completed."
echo "Results are usually saved to freqtrade/user_data/hyperopt_results/"
echo "Update your strategy file or config with the new parameters."
echo "=========================================================="
