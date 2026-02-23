"""
RSI Momentum Strategy - RSI-based momentum trading
"""
from freqtrade.strategy import IStrategy
from pandas import DataFrame
import talib.abstract as ta


class RSIMomentumStrategy(IStrategy):
    """
    RSI-based momentum strategy.
    Buy when RSI is oversold and starting to recover.
    Sell when RSI is overbought.
    """
    
    INTERFACE_VERSION = 3
    
    # Strategy parameters
    rsi_period = 14
    rsi_oversold = 30
    rsi_overbought = 70
    
    # ROI table
    minimal_roi = {
        "0": 0.15,
        "40": 0.08,
        "80": 0.04,
        "160": 0.02
    }
    
    # Stoploss
    stoploss = -0.08
    
    # Trailing stop
    trailing_stop = True
    trailing_stop_positive = 0.02
    trailing_stop_positive_offset = 0.03
    trailing_only_offset_is_reached = True
    
    # Timeframe
    timeframe = '15m'
    
    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """Generate all indicators needed by the strategy"""
        
        # RSI
        dataframe['rsi'] = ta.RSI(dataframe, timeperiod=self.rsi_period)
        
        # Bollinger Bands for additional confirmation
        bollinger = ta.BBANDS(dataframe, timeperiod=20, nbdevup=2, nbdevdn=2)
        dataframe['bb_upper'] = bollinger['upperband']
        dataframe['bb_middle'] = bollinger['middleband']
        dataframe['bb_lower'] = bollinger['lowerband']
        
        return dataframe
    
    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """Define entry (buy) signals"""
        
        dataframe.loc[
            (
                # RSI is oversold and starting to recover
                (dataframe['rsi'] < self.rsi_oversold) &
                (dataframe['rsi'] > dataframe['rsi'].shift(1)) &
                # Price near lower Bollinger Band
                (dataframe['close'] < dataframe['bb_middle']) &
                (dataframe['volume'] > 0)
            ),
            'enter_long'] = 1
        
        return dataframe
    
    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """Define exit (sell) signals"""
        
        dataframe.loc[
            (
                # RSI is overbought
                (dataframe['rsi'] > self.rsi_overbought) &
                # Price near upper Bollinger Band
                (dataframe['close'] > dataframe['bb_middle']) &
                (dataframe['volume'] > 0)
            ),
            'exit_long'] = 1
        
        return dataframe
