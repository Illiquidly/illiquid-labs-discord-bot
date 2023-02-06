const escapeSingleQuotes = (str: string) => str.replace(/'/g, "\\'");

type TendermintQueryOperand = string | number | Date;

export interface TendermintQuery {
  [k: string]:
    | TendermintQueryOperand
    | [">", number | Date]
    | ["<", number | Date]
    | ["<=", number | Date]
    | [">=", number | Date]
    | ["CONTAINS", string]
    | ["EXISTS"];
}

function makeQueryParams(query: TendermintQuery): string {
  const queryBuilder: string[] = [];
  for (const key of Object.keys(query)) {
    let queryItem: string;
    const value = query[key];
    // if value is scalar
    if (!Array.isArray(value)) {
      switch (typeof value) {
        case "number":
          queryItem = `${key}=${value}`;
          break;
        case "string":
          queryItem = `${key}='${escapeSingleQuotes(value)}'`;
          break;
        default:
          // Date
          queryItem = `${key}=${value.toISOString()}`;
      }
    } else {
      switch (value[0]) {
        case ">":
        case "<":
        case "<=":
        case ">=":
          if (typeof value[1] !== "number") {
            queryItem = `${key}${value[0]}${value[1].toISOString()}`;
          } else {
            queryItem = `${key}${value[0]}${value[1]}`;
          }
          break;
        case "CONTAINS":
          queryItem = `${key} CONTAINS '${escapeSingleQuotes(value[1])}'`;
          break;
        case "EXISTS":
          queryItem = `${key} EXISTS`;
          break;
      }
    }
    queryBuilder.push(queryItem);
  }
  return queryBuilder.join(" AND ");
}

export { makeQueryParams };
