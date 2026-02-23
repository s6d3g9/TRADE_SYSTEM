"""
Sample Strategy for Freqtrade
This is a simple EMA crossover strategy for testing purposes.
"""
from freqtrade.strategy import IStrategy, IntParameter
from pandas import DataFrame
import talib.abstract as ta


class SampleStrategy(IStrategy):
    """
    Sample trading strategy using EMA crossover.
    """
    
    INTERFACE_VERSION = 3
    
    # ROI table
    minimal_roi = {
        "60": 0.01,
        "30": 0.02,
        "0": 0.04
    }
    
    # Stoploss
    stoploss = -0.10
    
    # Trailing stoploss
    trailing_stop = False
    trailing_stop_positive = 0.01
    trailing_stop_positive_offset = 0.02
    trailing_only_offset_is_reached = True
    
    # Timeframe
    timeframe = '1h'
    
    # Run on new candles only
    process_only_new_candles = True
    
    # Trading startup candles
    startup_candle_count = 50
    
    # Strategy parameters
    buy_ema_short = IntParameter(5, 20, default=8, space="buy")
    buy_ema_long = IntParameter(20, 100, default=21, space="buy")
    sell_ema_short = IntParameter(5, 20, default=8, space="sell")
    sell_ema_long = IntParameter(20, 100, default=21, space="sell")
    
    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        Adds several different TA indicators to the given DataFrame
        """
        # EMA - Exponential Moving Average
        dataframe['ema8'] = ta.EMA(dataframe, timeperiod=8)
        dataframe['ema21'] = ta.EMA(dataframe, timeperiod=21)
        dataframe['ema50'] = ta.EMA(dataframe, timeperiod=50)
        
        # RSI
        dataframe['rsi'] = ta.RSI(dataframe, timeperiod=14)
        
        # MACD
        macd = ta.MACD(dataframe)
        dataframe['macd'] = macd['macd']
        dataframe['macdsignal'] = macd['macdsignal']
        dataframe['macdhist'] = macd['macdhist']
        
        # Bollinger Bands
        bollinger = ta.BBANDS(dataframe, timeperiod=20, nbdevup=2.0, nbdevdn=2.0)
        dataframe['bb_lowerband'] = bollinger['lowerband']
        dataframe['bb_middleband'] = bollinger['middleband']
        dataframe['bb_upperband'] = bollinger['upperband']
        
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        Based on TA indicators, populates the entry signal for the given dataframe
        """
        dataframe.loc[
            (
                # EMA crossover
                (dataframe['ema8'] > dataframe['ema21']) &
                (dataframe['ema8'].shift(1) <= dataframe['ema21'].shift(1)) &
                # RSI not overbought
                (dataframe['rsi'] < 70) &
                # Volume filter
                (dataframe['volume'] > 0)
            ),
            'enter_long'] = 1

        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        Based on TA indicators, populates the exit signal for the given dataframe
        """
        dataframe.loc[
            (
                # EMA crossunder
                (dataframe['ema8'] < dataframe['ema21']) &
                (dataframe['ema8'].shift(1) >= dataframe['ema21'].shift(1)) &
                # Volume filter
                (dataframe['volume'] > 0)
            ),
            'exit_long'] = 1

        return dataframe
