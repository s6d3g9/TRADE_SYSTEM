"""
EMA Cross Strategy - Simple moving average crossover
"""
from freqtrade.strategy import IStrategy
from pandas import DataFrame
import talib.abstract as ta


class EMACrossStrategy(IStrategy):
    """
    Simple EMA crossover strategy.
    Buy when fast EMA crosses above slow EMA.
    Sell when fast EMA crosses below slow EMA.
    """
    
    INTERFACE_VERSION = 3
    
    # Strategy parameters
    buy_ema_short = 9
    buy_ema_long = 21
    sell_ema_short = 9
    sell_ema_long = 21
    
    # ROI table
    minimal_roi = {
        "0": 0.10,
        "30": 0.05,
        "60": 0.02,
        "120": 0.01
    }
    
    # Stoploss
    stoploss = -0.05
    
    # Trailing stop
    trailing_stop = True
    trailing_stop_positive = 0.01
    trailing_stop_positive_offset = 0.02
    trailing_only_offset_is_reached = True
    
    # Timeframe
    timeframe = '5m'
    
    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """Generate all indicators needed by the strategy"""
        
        # EMA - Fast
        dataframe['ema_short'] = ta.EMA(dataframe, timeperiod=self.buy_ema_short)
        
        # EMA - Slow
        dataframe['ema_long'] = ta.EMA(dataframe, timeperiod=self.buy_ema_long)
        
        return dataframe
    
    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """Define entry (buy) signals"""
        
        dataframe.loc[
            (
                # Fast EMA crosses above Slow EMA
                (dataframe['ema_short'] > dataframe['ema_long']) &
                (dataframe['ema_short'].shift(1) <= dataframe['ema_long'].shift(1)) &
                (dataframe['volume'] > 0)
            ),
            'enter_long'] = 1
        
        return dataframe
    
    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """Define exit (sell) signals"""
        
        dataframe.loc[
            (
                # Fast EMA crosses below Slow EMA
                (dataframe['ema_short'] < dataframe['ema_long']) &
                (dataframe['ema_short'].shift(1) >= dataframe['ema_long'].shift(1)) &
                (dataframe['volume'] > 0)
            ),
            'exit_long'] = 1
        
        return dataframe
