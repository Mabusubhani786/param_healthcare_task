import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  getSortedRowModel,
} from "@tanstack/react-table"
import { useState } from "react"
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[]
  data: TData[]
  sortable?: boolean
  loading?: boolean
  emptyMessage?: string
  page?: number
  totalPages?: number
  onPageChange?: (page: number) => void
  className?: string
}

export function DataTable<TData>({
  columns,
  data,
  sortable = true,
  loading,
  emptyMessage = "No data found",
  page = 1,
  totalPages = 1,
  onPageChange,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: sortable ? setSorting : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: sortable ? getSortedRowModel() : undefined,
    manualPagination: !!onPageChange,
  })

  if (loading) {
    return (
      <div className={cn("rounded-lg border bg-card flex flex-col", className)}>
        <div className="overflow-auto flex-1 min-h-0">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                {columns.map((_, i) => (
                  <TableHead key={i} className="bg-muted/50">
                    <Skeleton className="h-4 w-20" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, rowIdx) => (
                <TableRow key={rowIdx}>
                  {columns.map((_, colIdx) => (
                    <TableCell key={colIdx}>
                      <Skeleton className="h-4 w-full max-w-[8rem]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  if (data.length === 0 && !loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground shrink-0">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={cn("rounded-lg border bg-card flex flex-col", className)}>
      <div className="overflow-auto flex-1 min-h-0">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="bg-muted/50">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-2 shrink-0">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange?.(page - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => (
              <Button
                key={i}
                variant={page === i + 1 ? "default" : "ghost"}
                size="sm"
                className="min-w-[2rem]"
                onClick={() => onPageChange?.(i + 1)}
              >
                {i + 1}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange?.(page + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function sortableHeader(label: string) {
  return ({ column }: { column: any }) => (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 text-xs font-medium text-muted-foreground hover:text-foreground"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {label}
      <ArrowUpDown className="ml-1 size-3" />
    </Button>
  )
}
