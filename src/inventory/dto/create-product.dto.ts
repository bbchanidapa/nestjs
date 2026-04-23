export class CreateProductDto {
  sku!: string;
  name!: string;
  unit?: string;
  imageUrl?: string;
  price?: number;
}
