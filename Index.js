require("dotenv").config();
const express = require("express");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { z } = require("zod");

const AUTH_KEY   = process.env.FR_AUTH_KEY   || "";
const AUTH_TOKEN = process.env.FR_AUTH_TOKEN || "";
const SUBDOMAIN  = process.env.FR_SUBDOMAIN  || "";
const PORT       = parseInt(process.env.PORT || "3000", 10);

if (!AUTH_KEY || !AUTH_TOKEN || !SUBDOMAIN) {
  console.error("Missing required env vars: FR_AUTH_KEY, FR_AUTH_TOKEN, FR_SUBDOMAIN");
  process.exit(1);
}

const BASE_URL = `https://${SUBDOMAIN}.pestroutes.com/api`;

async function frGet(path, params = {}) {
  const query = new URLSearchParams({
    authenticationKey:   AUTH_KEY,
    authenticationToken: AUTH_TOKEN,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  const url = `${BASE_URL}/${path}?${query.toString()}`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) {
    throw new Error(`FieldRoutes API error ${res.status} on ${path}: ${await res.text()}`);
  }
  return res.json();
}

function toText(data) {
  return JSON.stringify(data, null, 2);
}

function createMcpServer() {
  const server = new McpServer({ name: "fieldroutes", version: "1.0.0" });

  server.registerTool("search_customers", {
    title: "Search Customers",
    description: "Search FieldRoutes customers by name, phone, email, or address.",
    inputSchema: {
      fname:   z.string().optional().describe("First name"),
      lname:   z.string().optional().describe("Last name"),
      phone:   z.string().optional().describe("Phone number"),
      email:   z.string().optional().describe("Email address"),
      address: z.string().optional().describe("Street address"),
      city:    z.string().optional().describe("City"),
      zip:     z.string().optional().describe("ZIP code"),
    },
  }, async (args) => {
    const params = {};
    if (args.fname)   params.fname   = args.fname;
    if (args.lname)   params.lname   = args.lname;
    if (args.phone)   params.phone   = args.phone;
    if (args.email)   params.email   = args.email;
    if (args.address) params.address = args.address;
    if (args.city)    params.city    = args.city;
    if (args.zip)     params.zip     = args.zip;
    const data = await frGet("customer/search", params);
    return { content: [{ type: "text", text: toText(data) }] };
  });

  server.registerTool("get_customer", {
    title: "Get Customer Details",
    description: "Full details for a FieldRoutes customer by ID.",
    inputSchema: {
      customerID: z.string().describe("The FieldRoutes customer ID"),
    },
  }, async (args) => {
    const data = await frGet("customer/get", { customerID: args.customerID });
    return { content: [{ type: "text", text: toText(data) }] };
  });

  server.registerTool("get_service_history", {
    title: "Get Customer Service History",
    description: "Completed and open service tickets for a customer.",
    inputSchema: {
      customerID: z.string().describe("The FieldRoutes customer ID"),
      dateStart:  z.string().optional().describe("Filter start date (YYYY-MM-DD)"),
      dateEnd:    z.string().optional().describe("Filter end date (YYYY-MM-DD)"),
      status:     z.enum(["0","1","2"]).optional().describe("0=pending, 1=completed, 2=cancelled"),
    },
  }, async (args) => {
    const params = { customerID: args.customerID };
    if (args.dateStart) params.dateStart        = args.dateStart;
    if (args.dateEnd)   params.dateEnd          = args.dateEnd;
    if (args.status)    params.completionStatus = args.status;
    const data = await frGet("ticket/search", params);
    return { content: [{ type: "text", text: toText(data) }] };
  });

  server.registerTool("get_ticket", {
    title: "Get Ticket Details",
    description: "Full details on a single service ticket.",
    inputSchema: {
      ticketID: z.string().describe("The FieldRoutes ticket ID"),
    },
  }, async (args) => {
    const data = await frGet("ticket/get", { ticketID: args.ticketID });
    return { content: [{ type: "text", text: toText(data) }] };
  });

  server.registerTool("get_appointments", {
    title: "Get Appointments",
    description: "Search scheduled appointments by customer, date range, route, or technician.",
    inputSchema: {
      customerID: z.string().optional().describe("Filter by customer ID"),
      routeID:    z.string().optional().describe("Filter by route ID"),
      employeeID: z.string().optional().describe("Filter by technician employee ID"),
      dateStart:  z.string().optional().describe("Start date (YYYY-MM-DD)"),
      dateEnd:    z.string().optional().describe("End date (YYYY-MM-DD)"),
      status:     z.enum(["0","1","2"]).optional().describe("0=pending, 1=completed, 2=cancelled"),
    },
  }, async (args) => {
    const params = {};
    if (args.customerID) params.customerID = args.customerID;
    if (args.routeID)    params.routeID    = args.routeID;
    if (args.employeeID) params.employeeID = args.employeeID;
    if (args.dateStart)  params.dateStart  = args.dateStart;
    if (args.dateEnd)    params.dateEnd    = args.dateEnd;
    if (args.status)     params.status     = args.status;
    const data = await frGet("appointment/search", params);
    return { content: [{ type: "text", text: toText(data) }] };
  });

  server.registerTool("get_routes", {
    title: "Get Routes",
    description: "Retrieve service routes for a date or date range.",
    inputSchema: {
      date:       z.string().optional().describe("Specific date (YYYY-MM-DD)"),
      dateStart:  z.string().optional().describe("Start of date range (YYYY-MM-DD)"),
      dateEnd:    z.string().optional().describe("End of date range (YYYY-MM-DD)"),
      employeeID: z.string().optional().describe("Filter by technician employee ID"),
    },
  }, async (args) => {
    const params = {};
    if (args.date)       params.date       = args.date;
    if (args.dateStart)  params.dateStart  = args.dateStart;
    if (args.dateEnd)    params.dateEnd    = args.dateEnd;
    if (args.employeeID) params.employeeID = args.employeeID;
    const data = await frGet("route/search", params);
    return { content: [{ type: "text", text: toText(data) }] };
  });

  server.registerTool("get_route_details", {
    title: "Get Route Details",
    description: "All stops on a specific route: customer, address, service type, and order.",
    inputSchema: {
      routeID: z.string().describe("The FieldRoutes route ID"),
    },
  }, async (args) => {
    const data = await frGet("route/get", { routeID: args.routeID });
    return { content: [{ type: "text", text: toText(data) }] };
  });

  server.registerTool("get_subscriptions", {
    title: "Get Customer Subscriptions",
    description: "Recurring service plans for a customer.",
    inputSchema: {
      customerID:  z.string().optional().describe("Filter by customer ID"),
      status:      z.enum(["0","1","2"]).optional().describe("0=pending, 1=active, 2=cancelled"),
      serviceType: z.string().optional().describe("Filter by service type ID"),
    },
  }, async (args) => {
    const params = {};
    if (args.customerID)  params.customerID  = args.customerID;
    if (args.status)      params.status      = args.status;
    if (args.serviceType) params.serviceType = args.serviceType;
    const data = await frGet("subscription/search", params);
    return { content: [{ type: "text", text: toText(data) }] };
  });

  server.registerTool("get_employees", {
    title: "Get Employees / Technicians",
    description: "List of employees and technicians with IDs and status.",
    inputSchema: {
      active: z.boolean().optional().describe("If true, return only active employees"),
      type:   z.string().optional().describe("Filter by employee type"),
    },
  }, async (args) => {
    const params = {};
    if (args.active !== undefined) params.active = args.active ? "1" : "0";
    if (args.type)                 params.type   = args.type;
    const data = await frGet("employee/search", params);
    return { content: [{ type: "text", text: toText(data) }] };
  });

  server.registerTool("get_invoices", {
    title: "Get Customer Invoices",
    description: "Invoices and balances for a customer.",
    inputSchema: {
      customerID: z.string().optional().describe("Filter by customer ID"),
      dateStart:  z.string().optional().describe("Invoice date start (YYYY-MM-DD)"),
      dateEnd:    z.string().optional().describe("Invoice date end (YYYY-MM-DD)"),
      status:     z.enum(["0","1","2"]).optional().describe("0=unpaid, 1=paid, 2=void"),
    },
  }, async (args) => {
    const params = {};
    if (args.customerID) params.customerID = args.customerID;
    if (args.dateStart)  params.dateStart  = args.dateStart;
    if (args.dateEnd)    params.dateEnd    = args.dateEnd;
    if (args.status)     params.status     = args.status;
    const data = await frGet("invoice/search", params);
    return { content: [{ type: "text", text: toText(data) }] };
  });

  return server;
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "fieldroutes-mcp" });
});

app.all("/mcp", async (req, res) => {
  const server    = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`FieldRoutes MCP server running on port ${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});
