"""add_audit_fields_to_providers

Revision ID: 6f683c2718b4
Revises: 07912343666e
Create Date: 2026-09-07 15:09:36.731957

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6f683c2718b4'
down_revision: Union[str, Sequence[str], None] = '07912343666e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('providers', sa.Column('created_by_id', sa.Integer(), nullable=True))
    op.add_column('providers', sa.Column('updated_by_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_providers_created_by_id_users', 'providers', 'users', ['created_by_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_providers_updated_by_id_users', 'providers', 'users', ['updated_by_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_providers_created_by_id_users', 'providers', type_='foreignkey')
    op.drop_constraint('fk_providers_updated_by_id_users', 'providers', type_='foreignkey')
    op.drop_column('providers', 'updated_by_id')
    op.drop_column('providers', 'created_by_id')
