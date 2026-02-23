"""SQLAlchemy model package.

This module exists to ensure Alembic autogenerate can see all models when
imported from alembic env.
"""

# Import Base first
from app.models.base import Base  # noqa: F401

# Import model modules for side-effects (table registration)
from app.models import market  # noqa: F401
from app.models import neuro  # noqa: F401
from app.models import strategylab  # noqa: F401
from app.models import user  # noqa: F401
from app.models import user_settings  # noqa: F401
from app.models import email_login  # noqa: F401
from app.models import store  # noqa: F401
from app.models import trading  # noqa: F401
from app.models import analysis  # noqa: F401
from app.models import graph  # noqa: F401
