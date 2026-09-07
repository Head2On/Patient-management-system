"""add_audit_fields_to_patients

Revision ID: 7adab851bac6
Revises: f382a66749ad
Create Date: 2026-09-07 13:38:09.457185

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7adab851bac6'
down_revision: Union[str, Sequence[str], None] = 'f382a66749ad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('patients', sa.Column('created_by_id', sa.Integer(), nullable=True))
    op.add_column('patients', sa.Column('updated_by_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_patients_created_by_id_users', 'patients', 'users', ['created_by_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_patients_updated_by_id_users', 'patients', 'users', ['updated_by_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_patients_created_by_id_users', 'patients', type_='foreignkey')
    op.drop_constraint('fk_patients_updated_by_id_users', 'patients', type_='foreignkey')
    op.drop_column('patients', 'updated_by_id')
    op.drop_column('patients', 'created_by_id')
