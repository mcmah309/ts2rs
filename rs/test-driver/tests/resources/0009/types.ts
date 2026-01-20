// Test case 0009: String literal unions (enum-like types)
export type Status = "pending" | "approved" | "rejected" | "cancelled";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface ApiRequest {
  method: HttpMethod;
  endpoint: string;
  status: Status;
}
