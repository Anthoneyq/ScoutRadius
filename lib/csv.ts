/**
 * CSV export utilities
 */

// MVP: CSV export structure (matches MVP requirements)
export interface ExportRow {
  'Entity Name': string;
  'Entity Type': string; // Public School, Private School, or Club
  'Public / Private': string; // Public, Private, or N/A (for clubs)
  'Sports Offered': string; // Comma-separated list
  'Address': string;
  'City': string;
  'State': string;
  'ZIP': string;
  'Website': string;
  'Phone': string;
  'Distance (miles)': number | string;
  'Drive Time (minutes)': number | string;
  'Confidence Score': number | string;
  'Notes': string;
  'Tags': string;
}

/**
 * Convert array of objects to CSV string
 */
export function arrayToCSV(data: ExportRow[]): string {
  if (data.length === 0) {
    return '';
  }

  // Get headers
  const headers = Object.keys(data[0]);
  
  // Escape CSV values
  const escapeCSV = (value: any): string => {
    if (value === null || value === undefined) {
      return '';
    }
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Build CSV rows
  const rows = [
    headers.map(escapeCSV).join(','),
    ...data.map(row => 
      headers.map(header => escapeCSV(row[header as keyof ExportRow])).join(',')
    ),
  ];

  return rows.join('\n');
}

/**
 * Download CSV file
 */
export function downloadCSV(csvContent: string, filename: string = 'export.csv'): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}
