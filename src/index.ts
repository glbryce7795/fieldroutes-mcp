import "dotenv/config";
import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

// ─── Configuration ─────────────────────────────────────────────────────────────
const AUTH_KEY   = process.env.FR_AUTH_KEY   ?? "";
const AUTH_TOKEN = process.env.FR_AUTH_TOKEN ?? "";
const SUBDOMAIN  = process.env.FR_SUBDOMAIN  ?? ""; // e.g. "crownpest" (no .pestroutes.com)
const PORT       = parseInt(process.env.PORT ?? "3000", 10);

if (!AUTH_KEY || !AUTH_TOKEN || !SUBDOMAIN) {
  console.error("Missing required env vars: FR_AUTH_KEY, FR_AUTH_TOKEN, FR_SUBDOMAIN");
  process.exit(1);
}

const BASE_URL = `https://${SUBDOMAIN}.pestroutes.com/api`;

// ─── FieldRoutes API helper ─────────────────────────────────────────────────────
async function frGet(path: string, params: Record<string, string | number> = {}): Promise<unknown> {
  const query = new URLSearchParams({
    authenticationKey:   AUTH_KEY,
    authenticationToken: AUTH_TOKEN,
    ...Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ),
  });

  const url = `${BASE_URL}/${path}?${query.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "Accept": "application/json" },
  });

  if (!res.ok) {
    throw new Error(`FieldRoutes API error ${res.status} on ${path}: ${await res.text()}`);
  }

  return res.json();
}

// Helper to build a readable text summary Claude can present
function toText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// ─── MCP Server ─────────────────────────────────────────────────────────────────
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "fieldroutes",
    version: "1.0.0",
  });

  // ── 1. Search Customers ──────────────────────────────────────────────────────
  server.registerTool(
    "search_customers",
    {
      title: "Search Customers",
      description:
        "Search FieldRoutes customers by name, phone number, email, or street address. " +
        "Returns a list of matching customers with their IDs, contact info, and service address. " +
        "Use this first to find a customer before pulling their full details.",
      inputSchema: {
        fname:   z.string().optional().describe("First name (partial match OK)"),
        lname:   z.string().optional().describe("Last name (partial match OK)"),
        phone:   z.string().optional().describe("Phone number"),
        email:   z.string().optional().describe("Email address"),
        address: z.string().optional().describe("Street address"),
        city:    z.string().optional().describe("City"),
        zip:     z.string().optional().describe("ZIP code"),
      },
    },
    async (args) => {
      const params: Record<string, string> = {};
      if (args.fname)   params["fname"]   = args.fname;
      if (args.lname)   params["lname"]   = args.lname;
      if (args.phone)   params["phone"]   = args.phone;
      if (args.email)   params["email"]   = args.email;
      if (args.address) params["address"] = args.address;
      if (args.city)    params["city"]    = args.city;
      if (args.zip)     params["zip"]     = args.zip;

      const data = await frGet("customer/search", params);
      return { content: [{ type: "text", text: toText(data) }] };
    }
  );

  // ── 2. Get Customer ──────────────────────────────────────────────────────────
  server.registerTool(
    "get_customer",
    {
      title: "Get Customer Details",
      description:
        "Retrieve full details for a specific FieldRoutes customer by their customer ID. " +
        "Returns contact info, billing address, service address, account status, source, " +
        "balance, and notes. Use search_customers first if you only have a name.",
      inputSchema: {
        customerID: z.string().describe("The FieldRoutes customer ID"),
      },
    },
    async (args) => {
      const data = await frGet("customer/get", { customerID: args.customerID });
      return { content: [{ type: "text", text: toText(data) }] };
    }
  );

  // ── 3. Get Customer Service History (Tickets) ────────────────────────────────
  server.registerTool(
    "get_service_history",
    {
      title: "Get Customer Service History",
      description:
        "Retrieve completed and open service tickets (jobs) for a customer. " +
        "Shows service type, date completed, technician, amount charged, and any notes. " +
        "Useful for checking what was done on a previous visit or reviewing account history.",
      inputSchema: {
        customerID: z.string().describe("The FieldRoutes customer ID"),
        dateStart:  z.string().optional().describe("Filter by start date (YYYY-MM-DD)"),
        dateEnd:    z.string().optional().describe("Filter by end date (YYYY-MM-DD)"),
        status:     z.enum(["0", "1", "2"]).optional().describe("0=pending, 1=completed, 2=cancelled"),
      },
    },
    async (args) => {
      const params: Record<string, string> = { customerID: args.customerID };
      if (args.dateStart) params["dateStart"]        = args.dateStart;
      if (args.dateEnd)   params["dateEnd"]          = args.dateEnd;
      if (args.status)    params["completionStatus"] = args.status;

      const data = await frGet("ticket/search", params);
      return { content: [{ type: "text", text: toText(data) }] };
    }
  );

  // ── 4. Get Ticket Details ────────────────────────────────────────────────────
  server.registerTool(
    "get_ticket",
    {
      title: "Get Ticket Details",
      description:
        "Retrieve full details for a specific service ticket/job by its ticket ID. " +
        "Returns service type, scheduled date, assigned technician, chemicals used, " +
        "completion notes, amount charged, and payment status.",
      inputSchema: {
        ticketID: z.string().describe("The FieldRoutes ticket ID"),
      },
    },
    async (args) => {
      const data = await frGet("ticket/get", { ticketID: args.ticketID });
      return { content: [{ type: "text", text: toText(data) }] };
    }
  );

  // ── 5. Get Appointments ──────────────────────────────────────────────────────
  server.registerTool(
    "get_appointments",
    {
      title: "Get Appointments",
      description:
        "Search for scheduled appointments. Can filter by customer, date range, route, " +
        "technician, or status. Returns appointment date/time, service type, assigned " +
        "tech, and route. Great for checking what's scheduled for today or a specific customer.",
      inputSchema: {
        customerID:  z.string().optional().describe("Filter by customer ID"),
        routeID:     z.string().optional().describe("Filter by route ID"),
        employeeID:  z.string().optional().describe("Filter by technician employee ID"),
        dateStart:   z.string().optional().describe("Start of date range (YYYY-MM-DD)"),
        dateEnd:     z.string().optional().describe("End of date range (YYYY-MM-DD)"),
        status:      z.enum(["0", "1", "2"]).optional().describe("0=pending, 1=completed, 2=cancelled"),
        officeID:    z.string().optional().describe("Filter by office ID (for multi-office setups)"),
      },
    },
    async (args) => {
      const params: Record<string, string> = {};
      if (args.customerID)  params["customerID"]  = args.customerID;
      if (args.routeID)     params["routeID"]     = args.routeID;
      if (args.employeeID)  params["employeeID"]  = args.employeeID;
      if (args.dateStart)   params["dateStart"]   = args.dateStart;
      if (args.dateEnd)     params["dateEnd"]     = args.dateEnd;
      if (args.status)      params["status"]      = args.status;
      if (args.officeID)    params["officeID"]    = args.officeID;

      const data = await frGet("appointment/search", params);
      return { content: [{ type: "text", text: toText(data) }] };
    }
  );

  // ── 6. Get Routes ────────────────────────────────────────────────────────────
  server.registerTool(
    "get_routes",
    {
      title: "Get Routes",
      description:
        "Retrieve service routes for a given date or date range. Returns each route's ID, " +
        "name, assigned technician, date, and the number of stops. " +
        "Use this to see what routes are running today, then use get_route_details for stops.",
      inputSchema: {
        date:      z.string().optional().describe("Specific date to get routes for (YYYY-MM-DD). Defaults to today."),
        dateStart: z.string().optional().describe("Start of date range (YYYY-MM-DD)"),
        dateEnd:   z.string().optional().describe("End of date range (YYYY-MM-DD)"),
        employeeID: z.string().optional().describe("Filter by technician employee ID"),
        officeID:  z.string().optional().describe("Filter by office ID"),
      },
    },
    async (args) => {
      const params: Record<string, string> = {};
      if (args.date)       params["date"]       = args.date;
      if (args.dateStart)  params["dateStart"]  = args.dateStart;
      if (args.dateEnd)    params["dateEnd"]    = args.dateEnd;
      if (args.employeeID) params["employeeID"] = args.employeeID;
      if (args.officeID)   params["officeID"]   = args.officeID;

      const data = await frGet("route/search", params);
      return { content: [{ type: "text", text: toText(data) }] };
    }
  );

  // ── 7. Get Route Details ─────────────────────────────────────────────────────
  server.registerTool(
    "get_route_details",
    {
      title: "Get Route Details",
      description:
        "Retrieve all stops/appointments on a specific route by route ID. " +
        "Returns customer name, address, service type, and stop order for every stop on the route. " +
        "Useful for checking who is on a tech's route for the day.",
      inputSchema: {
        routeID: z.string().describe("The FieldRoutes route ID"),
      },
    },
    async (args) => {
      const data = await frGet("route/get", { routeID: args.routeID });
      return { content: [{ type: "text", text: toText(data) }] };
    }
  );

  // ── 8. Get Subscriptions ─────────────────────────────────────────────────────
  server.registerTool(
    "get_subscriptions",
    {
      title: "Get Customer Subscriptions",
      description:
        "Retrieve the recurring service subscriptions for a customer. " +
        "Shows service plan, frequency, price, start date, and current status (active/cancelled). " +
        "Useful for checking what recurring services a customer has signed up for.",
      inputSchema: {
        customerID: z.string().optional().describe("Filter by customer ID"),
        status:     z.enum(["0", "1", "2"]).optional().describe("0=pending, 1=active, 2=cancelled"),
        serviceType: z.string().optional().describe("Filter by service type ID"),
      },
    },
    async (args) => {
      const params: Record<string, string> = {};
      if (args.customerID)  params["customerID"]  = args.customerID;
      if (args.status)      params["status"]      = args.status;
      if (args.serviceType) params["serviceType"] = args.serviceType;

      const data = await frGet("subscription/search", params);
      return { content: [{ type: "text", text: toText(data) }] };
    }
  );

  // ── 9. Get Employees / Technicians ───────────────────────────────────────────
  server.registerTool(
    "get_employees",
    {
      title: "Get Employees / Technicians",
      description:
        "Retrieve a list of employees (technicians, office staff) from FieldRoutes. " +
        "Returns employee ID, name, type, and status. " +
        "Useful for finding a tech's employee ID to filter routes or appointments by technician.",
      inputSchema: {
        active: z.boolean().optional().describe("If true, return only active employees. Default: true."),
        type:   z.string().optional().describe("Filter by employee type (e.g. technician)"),
      },
    },
    async (args) => {
      const params: Record<string, string> = {};
      if (args.active !== undefined) params["active"] = args.active ? "1" : "0";
      if (args.type)                 params["type"]   = args.type;

      const data = await frGet("employee/search", params);
      return { content: [{ type: "text", text: toText(data) }] };
    }
  );

  // ── 10. Get Customer Balance / Invoices ──────────────────────────────────────
  server.registerTool(
    "get_invoices",
    {
      title: "Get Customer Invoices",
      description:
        "Retrieve outstanding or historical invoices for a customer. " +
        "Shows invoice date, amount, amount paid, balance due, and payment status. " +
        "Useful for checking if a customer owes a balance or reviewing billing history.",
      inputSchema: {
        customerID: z.string().optional().describe("Filter by customer ID"),
        dateStart:  z.string().optional().describe("Invoice date start (YYYY-MM-DD)"),
        dateEnd:    z.string().optional().describe("Invoice date end (YYYY-MM-DD)"),
        status:     z.enum(["0", "1", "2"]).optional().describe("0=unpaid, 1=paid, 2=void"),
      },
    },
    async (args) => {
      const params: Record<string, string> = {};
      if (args.customerID) params["customerID"] = args.customerID;
      if (args.dateStart)  params["dateStart"]  = args.dateStart;
      if (args.dateEnd)    params["dateEnd"]    = args.dateEnd;
      if (args.status)     params["status"]     = args.status;

      const data = await frGet("invoice/search", params);
      return { content: [{ type: "text", text: toText(data) }] };
    }
  );

  return server;
}

// ─── Express HTTP Server ─────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Health check — Railway/Render ping this to confirm the server is up
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "fieldroutes-mcp" });
});

// MCP endpoint — Claude connects here
app.all("/mcp", async (req: Request, res: Response) => {
  const server    = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — a new server per request
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

app.listen(PORT, () => {
  console.log(`FieldRoutes MCP server running on port ${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Connected to: ${BASE_URL}`);
});
