"""add_audit_fields_to_appointments

Revision ID: 07912343666e
Revises: 7adab851bac6
Create Date: 2026-09-07 14:38:27.757449

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '07912343666e'
down_revision: Union[str, Sequence[str], None] = '7adab851bac6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('appointments', sa.Column('created_by_id', sa.Integer(), nullable=True))
    op.add_column('appointments', sa.Column('updated_by_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_appointments_created_by_id_users', 'appointments', 'users', ['created_by_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_appointments_updated_by_id_users', 'appointments', 'users', ['updated_by_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_appointments_created_by_id_users', 'appointments', type_='foreignkey')
    op.drop_constraint('fk_appointments_updated_by_id_users', 'appointments', type_='foreignkey')
    op.drop_column('appointments', 'updated_by_id')
    op.drop_column('appointments', 'created_by_id')
