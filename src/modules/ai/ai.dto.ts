export class FilterSchemaOption {
  label: string;
  value: string;
}

export class FilterSchemaField {
  type: 'select' | 'date' | 'text' | 'number';
  label: string;
  options?: FilterSchemaOption[];
}

export class TableColumn {
  label: string;
  searchKey: string;
}

export class TableFilterQueryDto {
  query: string;
  tableName: string;
  schema: Record<string, FilterSchemaField>;
  tableColumns?: TableColumn[];
}
