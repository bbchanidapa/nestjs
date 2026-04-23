export class StockMovementDto {
  productId!: string;
  warehouseId!: string;
  quantity!: number;
  referenceNo?: string;
  note?: string;
}
