import toArray from 'rc-util/lib/Children/toArray';
import warning from 'rc-util/lib/warning';
import * as React from 'react';
import { EXPAND_COLUMN } from '../../constant';
import type {
  CellType,
  ColumnGroupType,
  ColumnsType,
  ColumnType,
  Direction,
  HeadMatrix,
  FixedType,
  GetRowKey,
  Key,
  RenderExpandIcon,
  TriggerEventHandler,
} from '../../interface';
import { convertColumns } from '../../utils/convertUtil';
import { INTERNAL_COL_DEFINE } from '../../utils/legacyUtil';
import useWidthColumns from './useWidthColumns';

export function convertChildrenToColumns<RecordType>(
  children: React.ReactNode,
): ColumnsType<RecordType> {
  return toArray(children)
    .filter(node => React.isValidElement(node))
    .map(({ key, props }: React.ReactElement) => {
      const { children: nodeChildren, ...restProps } = props;
      const column = {
        key,
        ...restProps,
      };

      if (nodeChildren) {
        column.children = convertChildrenToColumns(nodeChildren);
      }

      return column;
    });
}

function filterHiddenColumns<RecordType>(
  columns: ColumnsType<RecordType>,
): ColumnsType<RecordType> {
  return columns
    .filter(column => column && typeof column === 'object' && !column.hidden)
    .map(column => {
      const subColumns = (column as ColumnGroupType<RecordType>).children;

      if (subColumns && subColumns.length > 0) {
        return {
          ...column,
          children: filterHiddenColumns(subColumns),
        };
      }

      return column;
    });
}

function revertForRtl<RecordType>(columns: ColumnsType<RecordType>): ColumnsType<RecordType> {
  return columns.map(column => {
    const { fixed, ...restProps } = column;

    // Convert `fixed='left'` to `fixed='right'` instead
    let parsedFixed = fixed;
    if (fixed === 'left') {
      parsedFixed = 'right';
    } else if (fixed === 'right') {
      parsedFixed = 'left';
    }
    return {
      fixed: parsedFixed,
      ...restProps,
    };
  });
}

/**
 * Parse `columns` & `children` into `columns`.
 */
function useColumns<RecordType>(
  {
    prefixCls,
    columns,
    children,
    expandable,
    expandedKeys,
    columnTitle,
    getRowKey,
    onTriggerExpand,
    expandIcon,
    rowExpandable,
    expandIconColumnIndex,
    direction,
    expandRowByClick,
    columnWidth,
    fixed,
    scrollWidth,
    clientWidth,
  }: {
    prefixCls?: string;
    columns?: ColumnsType<RecordType>;
    children?: React.ReactNode;
    expandable: boolean;
    expandedKeys: Set<Key>;
    columnTitle?: React.ReactNode;
    getRowKey: GetRowKey<RecordType>;
    onTriggerExpand: TriggerEventHandler<RecordType>;
    expandIcon?: RenderExpandIcon<RecordType>;
    rowExpandable?: (record: RecordType) => boolean;
    expandIconColumnIndex?: number;
    direction?: Direction;
    expandRowByClick?: boolean;
    columnWidth?: number | string;
    clientWidth: number;
    fixed?: FixedType;
    scrollWidth?: number;
  },
  transformColumns: (columns: ColumnsType<RecordType>) => ColumnsType<RecordType>,
): [
  columns: ColumnsType<RecordType>,
  headCells: CellType<RecordType>[][],
  headMatrix: HeadMatrix,
  flattenColumns: readonly ColumnType<RecordType>[],
  realScrollWidth: undefined | number,
  hasGapFixed: boolean,
] {
  const baseColumns = React.useMemo<ColumnsType<RecordType>>(() => {
    const newColumns = columns || convertChildrenToColumns(children) || [];

    return filterHiddenColumns(newColumns.slice());
  }, [columns, children]);

  // ========================== Expand ==========================
  const withExpandColumns = React.useMemo<ColumnsType<RecordType>>(() => {
    if (expandable) {
      let cloneColumns = baseColumns.slice();

      // >>> Warning if use `expandIconColumnIndex`
      if (process.env.NODE_ENV !== 'production' && expandIconColumnIndex >= 0) {
        warning(
          false,
          '`expandIconColumnIndex` is deprecated. Please use `Table.EXPAND_COLUMN` in `columns` instead.',
        );
      }

      // >>> Insert expand column if not exist
      if (!cloneColumns.includes(EXPAND_COLUMN)) {
        const expandColIndex = expandIconColumnIndex || 0;
        if (expandColIndex >= 0) {
          cloneColumns.splice(expandColIndex, 0, EXPAND_COLUMN);
        }
      }

      // >>> Deduplicate additional expand column
      if (
        process.env.NODE_ENV !== 'production' &&
        cloneColumns.filter(c => c === EXPAND_COLUMN).length > 1
      ) {
        warning(false, 'There exist more than one `EXPAND_COLUMN` in `columns`.');
      }
      const expandColumnIndex = cloneColumns.indexOf(EXPAND_COLUMN);
      cloneColumns = cloneColumns.filter(
        (column, index) => column !== EXPAND_COLUMN || index === expandColumnIndex,
      );

      // >>> Check if expand column need to fixed
      const prevColumn = baseColumns[expandColumnIndex];

      let fixedColumn: FixedType | null;
      if ((fixed === 'left' || fixed) && !expandIconColumnIndex) {
        fixedColumn = 'left';
      } else if ((fixed === 'right' || fixed) && expandIconColumnIndex === baseColumns.length) {
        fixedColumn = 'right';
      } else {
        fixedColumn = prevColumn ? prevColumn.fixed : null;
      }

      // >>> Create expandable column
      const expandColumn = {
        [INTERNAL_COL_DEFINE]: {
          className: `${prefixCls}-expand-icon-col`,
          columnType: 'EXPAND_COLUMN',
        },
        title: columnTitle,
        fixed: fixedColumn,
        className: `${prefixCls}-row-expand-icon-cell`,
        width: columnWidth,
        render: (_, record, index) => {
          const rowKey = getRowKey(record, index);
          const expanded = expandedKeys.has(rowKey);
          const recordExpandable = rowExpandable ? rowExpandable(record) : true;

          const icon = expandIcon({
            prefixCls,
            expanded,
            expandable: recordExpandable,
            record,
            onExpand: onTriggerExpand,
          });

          if (expandRowByClick) {
            return <span onClick={e => e.stopPropagation()}>{icon}</span>;
          }
          return icon;
        },
      };

      return cloneColumns.map(col => (col === EXPAND_COLUMN ? expandColumn : col));
    }

    if (process.env.NODE_ENV !== 'production' && baseColumns.includes(EXPAND_COLUMN)) {
      warning(false, '`expandable` is not config but there exist `EXPAND_COLUMN` in `columns`.');
    }

    return baseColumns.filter(col => col !== EXPAND_COLUMN);
  }, [expandable, baseColumns, getRowKey, expandedKeys, expandIcon, direction]);

  // ========================= Transform ========================
  const mergedColumns = React.useMemo(() => {
    let finalColumns = withExpandColumns;
    if (transformColumns) {
      finalColumns = transformColumns(finalColumns);
    }

    // Always provides at least one column for table display
    if (!finalColumns.length) {
      finalColumns = [
        {
          render: () => null,
        },
      ];
    }
    return finalColumns;
  }, [transformColumns, withExpandColumns, direction]);

  const [headCells, headMatrix, lastColumns] = React.useMemo(() => {
    return convertColumns<RecordType>(mergedColumns);
  }, [mergedColumns]);

  // ========================== Flatten =========================
  const flattenColumns = React.useMemo(() => {
    if (direction === 'rtl') {
      return revertForRtl(lastColumns);
    }
    return lastColumns;
  }, [lastColumns, direction, scrollWidth]);

  // ========================= Gap Fixed ========================
  const hasGapFixed = React.useMemo(() => {
    // Fixed: left, since old browser not support `findLastIndex`, we should use reverse loop
    let lastLeftIndex = -1;
    for (let i = flattenColumns.length - 1; i >= 0; i -= 1) {
      const colFixed = flattenColumns[i].fixed;
      if (colFixed === 'left' || colFixed === true) {
        lastLeftIndex = i;
        break;
      }
    }

    if (lastLeftIndex >= 0) {
      for (let i = 0; i <= lastLeftIndex; i += 1) {
        const colFixed = flattenColumns[i].fixed;
        if (colFixed !== 'left' && colFixed !== true) {
          return true;
        }
      }
    }

    // Fixed: right
    const firstRightIndex = flattenColumns.findIndex(({ fixed: colFixed }) => colFixed === 'right');
    if (firstRightIndex >= 0) {
      for (let i = firstRightIndex; i < flattenColumns.length; i += 1) {
        const colFixed = flattenColumns[i].fixed;
        if (colFixed !== 'right') {
          return true;
        }
      }
    }

    return false;
  }, [flattenColumns]);

  // ========================= FillWidth ========================
  const [filledColumns, realScrollWidth] = useWidthColumns(
    flattenColumns,
    scrollWidth,
    clientWidth,
  );

  return [mergedColumns, headCells, headMatrix, filledColumns, realScrollWidth, hasGapFixed];
}

export default useColumns;
