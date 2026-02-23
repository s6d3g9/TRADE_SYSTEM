import ast
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

class HyperoptParamInfo(BaseModel):
    name: str
    type: str # Int, Decimal, Boolean, Categorical
    default: Any
    min: Optional[Any] = None
    max: Optional[Any] = None
    space: Optional[str] = None # buy, sell, protection...
    optimize: Optional[bool] = None
    category: Optional[str] = None # For distinguishing 'buy_rsi' vs 'buy_adx' if possible

class StrategyAnalysisResult(BaseModel):
    has_buy_params: bool = False
    has_sell_params: bool = False
    has_protection_params: bool = False
    parameters: List[HyperoptParamInfo] = []
    
    # Detected usage
    uses_roi: bool = False
    uses_trailing: bool = False
    timeframe: str = "5m"

def analyze_strategy_file(file_path: Path) -> StrategyAnalysisResult:
    if not file_path.exists():
        return StrategyAnalysisResult()

    try:
        source_code = file_path.read_text("utf-8")
        tree = ast.parse(source_code)
    except Exception as e:
        # If AST fails, fallback or return empty
        print(f"AST Parse Error: {e}")
        return StrategyAnalysisResult()

    result = StrategyAnalysisResult()
    
    # Visitor to find Class definitions inheriting IStrategy and their assignments
    class StrategyVisitor(ast.NodeVisitor):
        def __init__(self):
            self.params = []
            self.in_strategy_class = False

        def visit_ClassDef(self, node):
            # Simple check if class inherits from IStrategy (or just assuming the main class is the strategy)
            # In freqtrade, the class name usually matches filename, but not always.
            # We'll assume the detected class is the one.
            self.in_strategy_class = True
            self.generic_visit(node)
            self.in_strategy_class = False

        def visit_Assign(self, node):
            if not self.in_strategy_class:
                return

            # Analyze assignments like: buy_rsi = IntParameter(10, 40, default=20, space="buy")
            # node.targets[0].id (name of var)
            # node.value (Call)
            
            if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name):
                func_name = node.value.func.id
                if func_name in ["IntParameter", "DecimalParameter", "BooleanParameter", "CategoricalParameter", "RealParameter"]:
                    
                    param_name = "unknown"
                    if node.targets and isinstance(node.targets[0], ast.Name):
                        param_name = node.targets[0].id
                    
                    # Extract args
                    args = node.value.args
                    keywords = {k.arg: k.value for k in node.value.keywords}
                    
                    p_info = HyperoptParamInfo(
                        name=param_name,
                        type=func_name.replace("Parameter", ""),
                        default=None
                    )

                    # Extract min/max from args if available (Int/Decimal have min, max, default)
                    # IntParameter(low, high, default)
                    if func_name in ["IntParameter", "DecimalParameter", "RealParameter"]:
                        if len(args) > 0: p_info.min = self._get_literal(args[0])
                        if len(args) > 1: p_info.max = self._get_literal(args[1])
                        if len(args) > 2: p_info.default = self._get_literal(args[2])
                    
                    # Extract default from keywords
                    if 'default' in keywords:
                        p_info.default = self._get_literal(keywords['default'])
                    
                    # Extract space from keywords
                    if 'space' in keywords:
                        p_info.space = self._get_literal(keywords['space'])

                    # Extract optimize flag from keywords (Freqtrade HyperoptParameter)
                    if 'optimize' in keywords:
                        p_info.optimize = self._get_literal(keywords['optimize'])
                    
                    # Heuristics for space if not explicit
                    if not p_info.space:
                        if param_name.startswith("buy_"): p_info.space = "buy"
                        elif param_name.startswith("sell_"): p_info.space = "sell"
                        elif "protection" in param_name: p_info.space = "protection"
                    
                    # Update summary flags
                    # Only count spaces which are actually enabled for optimization.
                    # If optimize is absent, assume it is enabled by default.
                    if p_info.optimize is not False:
                        if p_info.space == "buy": result.has_buy_params = True
                        if p_info.space == "sell": result.has_sell_params = True
                        if p_info.space == "protection": result.has_protection_params = True
                    
                    self.params.append(p_info)
            
            # Detect simple static assignments for config override check
            # minimal_roi = ...
            if isinstance(node.targets[0], ast.Name):
                var_name = node.targets[0].id
                if var_name == "minimal_roi":
                    result.uses_roi = True
                if var_name == "trailing_stop":
                    # strictly speaking we need to check if value is True/False
                    val = self._get_literal(node.value)
                    if val is True: result.uses_trailing = True
                if var_name == "timeframe":
                    val = self._get_literal(node.value)
                    if val: result.timeframe = val

        def _get_literal(self, node):
            if isinstance(node, ast.Constant):
                return node.value
            if isinstance(node, ast.NameConstant): # python < 3.8
                return node.value
            return None

    visitor = StrategyVisitor()
    visitor.visit(tree)
    result.parameters = visitor.params
    
    return result
