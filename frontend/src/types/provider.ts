/**
 * Provider domain types
 * Derived from FastAPI OpenAPI schema
 */

export type PostType = "MD" | "MS";

export interface ProviderPublic {
  id: number;
  doc_number: string;
  name: string;
  specialization: string;
  post: PostType;
  is_active: boolean;
}

export interface Provider extends ProviderPublic {
  phone: string;
  email: string | null;
  created_by_id?: number | null;
  updated_by_id?: number | null;
}

export interface ProviderCreateInput {
  name: string;
  specialization: string;
  phone: string;
  email?: string | null;
  post: PostType;
}

export interface ProviderUpdateInput {
  name?: string | null;
  specialization?: string | null;
  phone?: string | null;
  email?: string | null;
  post?: PostType | null;
}
