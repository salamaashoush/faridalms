import { CopyButton } from "./copy-button";

/** One record a domain's DNS must hold. */
export interface DnsRecord {
  type: string;
  name: string;
  value: string;
}

/** The column names, in the reader's language. */
export interface DnsRecordLabels {
  type: string;
  name: string;
  value: string;
  /** How a copy button is named: "Copy the name of the TXT record". */
  copy: (part: string, type: string) => string;
}

export interface DnsRecordsProps {
  records: readonly DnsRecord[];
  labels: DnsRecordLabels;
}

/**
 * The records to create at a domain's DNS provider, laid out as its form
 * asks for them, each name and value one click from the clipboard.
 */
export function DnsRecords({ records, labels }: DnsRecordsProps) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-[13px] leading-[18px]">
        <thead className="border-b bg-muted/40 text-muted-foreground">
          <tr>
            <th scope="col" className="h-9 px-3 text-start font-medium">
              {labels.type}
            </th>
            <th scope="col" className="h-9 px-3 text-start font-medium">
              {labels.name}
            </th>
            <th scope="col" className="h-9 px-3 text-start font-medium">
              {labels.value}
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.type} className="border-b last:border-0">
              <th
                scope="row"
                className="px-3 py-2 text-start font-mono font-semibold whitespace-nowrap"
                dir="ltr"
              >
                {record.type}
              </th>
              <td className="px-3 py-1">
                <span className="flex items-center gap-1">
                  <span className="min-w-0 font-mono break-all" dir="ltr">
                    {record.name}
                  </span>
                  <CopyButton
                    value={record.name}
                    label={labels.copy(labels.name, record.type)}
                  />
                </span>
              </td>
              <td className="px-3 py-1">
                <span className="flex items-center gap-1">
                  <span className="min-w-0 font-mono break-all" dir="ltr">
                    {record.value}
                  </span>
                  <CopyButton
                    value={record.value}
                    label={labels.copy(labels.value, record.type)}
                  />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
