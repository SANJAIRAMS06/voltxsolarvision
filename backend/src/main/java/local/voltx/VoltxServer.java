package local.voltx;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.Date;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.concurrent.Executors;

public final class VoltxServer {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAX_REQUEST_BYTES = 1_048_576;
    private final Path webRoot;
    private final String databaseUrl;
    private final String databaseUser;
    private final String databasePassword;

    private VoltxServer() {
        webRoot = Path.of(System.getenv().getOrDefault("VOLTX_WEB_ROOT", ".."))
                .toAbsolutePath().normalize();
        databaseUrl = System.getenv().getOrDefault(
                "MYSQL_URL",
                "jdbc:mysql://127.0.0.1:3306/voltx?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC");
        databaseUser = System.getenv("MYSQL_USER");
        databasePassword = System.getenv().getOrDefault("MYSQL_PASSWORD", "");
        if (databaseUser == null || databaseUser.isBlank()) {
            throw new IllegalStateException("Set MYSQL_USER in backend/.env before starting the server.");
        }
    }

    public static void main(String[] args) throws IOException {
        VoltxServer app = new VoltxServer();
        app.reportDatabaseConnection();
        int port = Integer.parseInt(System.getenv().getOrDefault("VOLTX_PORT", "8080"));
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/api/", app::handleApi);
        server.createContext("/", app::handleStatic);
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();
        System.out.printf("VoltX is available at http://127.0.0.1:%d/%n", port);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> server.stop(0)));
    }

    private void reportDatabaseConnection() {
        try (Connection connection = connect(); var statement = connection.createStatement()) {
            statement.execute("SELECT 1");
            System.out.println("VoltX database connection verified.");
        } catch (SQLException e) {
            System.err.printf("VoltX database connection failed (%s, user=%s, password configured=%s).%n",
                    databaseUrl.replaceFirst("\\?.*$", ""), databaseUser, !databasePassword.isEmpty());
            e.printStackTrace(System.err);
        }
    }

    private Connection connect() throws SQLException {
        return DriverManager.getConnection(databaseUrl, databaseUser, databasePassword);
    }

    private void handleApi(HttpExchange exchange) throws IOException {
        try {
            String path = exchange.getRequestURI().getPath();
            String method = exchange.getRequestMethod();
            if ("/api/health".equals(path) && "GET".equals(method)) {
                try (Connection connection = connect(); var statement = connection.createStatement()) {
                    statement.execute("SELECT 1");
                }
                sendJson(exchange, 200, JSON.createObjectNode().put("status", "ok"));
                return;
            }
            if ("/api/readings".equals(path) && "GET".equals(method)) {
                sendJson(exchange, 200, listReadings());
                return;
            }
            if ("/api/readings".equals(path) && "POST".equals(method)) {
                ObjectNode created = insertReading(readRequest(exchange));
                sendJson(exchange, 201, created);
                return;
            }
            if (path.startsWith("/api/readings/") && "PUT".equals(method)) {
                long id = parseId(path.substring("/api/readings/".length()));
                ObjectNode updated = updateReading(id, readRequest(exchange));
                if (updated == null) {
                    sendError(exchange, 404, "Reading not found.");
                } else {
                    sendJson(exchange, 200, updated);
                }
                return;
            }
            if (path.equals("/api/readings") || path.startsWith("/api/readings/")) {
                sendError(exchange, 405, "Method not allowed.");
                return;
            }
            sendError(exchange, 404, "API endpoint not found.");
        } catch (BadRequestException e) {
            sendError(exchange, 400, e.getMessage());
        } catch (SQLException e) {
            System.err.println("Database request failed: " + e.getMessage());
            e.printStackTrace(System.err);
            sendError(exchange, 503, "Database unavailable. Check MySQL and backend/.env.");
        } catch (Exception e) {
            System.err.println("API request failed: " + e.getMessage());
            e.printStackTrace(System.err);
            sendError(exchange, 500, "Unexpected server error.");
        }
    }

    private JsonNode listReadings() throws SQLException {
        var rows = JSON.createArrayNode();
        String sql = "SELECT id, reading_date, expected_kwh, actual_kwh, capacity_kw, "
                + "dust, shade, inverter, wiring, source FROM generation_readings ORDER BY id";
        try (Connection connection = connect();
             PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet result = statement.executeQuery()) {
            while (result.next()) {
                rows.add(toJson(result));
            }
        }
        return rows;
    }

    private ObjectNode insertReading(ObjectNode input) throws SQLException {
        Reading reading = validate(input);
        String sql = "INSERT INTO generation_readings "
                + "(reading_date, expected_kwh, actual_kwh, capacity_kw, dust, shade, inverter, wiring, source) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
        try (Connection connection = connect();
             PreparedStatement statement = connection.prepareStatement(sql, PreparedStatement.RETURN_GENERATED_KEYS)) {
            bind(statement, reading, 1);
            statement.executeUpdate();
            try (ResultSet keys = statement.getGeneratedKeys()) {
                if (!keys.next()) {
                    throw new SQLException("MySQL did not return an ID for the new reading.");
                }
                return findReading(connection, keys.getLong(1));
            }
        }
    }

    private ObjectNode updateReading(long id, ObjectNode input) throws SQLException {
        Reading reading = validate(input);
        String sql = "UPDATE generation_readings SET reading_date=?, expected_kwh=?, actual_kwh=?, capacity_kw=?, "
                + "dust=?, shade=?, inverter=?, wiring=?, source=? WHERE id=?";
        try (Connection connection = connect();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            bind(statement, reading, 1);
            statement.setLong(10, id);
            if (statement.executeUpdate() == 0) {
                return null;
            }
            return findReading(connection, id);
        }
    }

    private ObjectNode findReading(Connection connection, long id) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT id, reading_date, expected_kwh, actual_kwh, capacity_kw, "
                        + "dust, shade, inverter, wiring, source FROM generation_readings WHERE id=?")) {
            statement.setLong(1, id);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw new SQLException("Reading was not found after saving.");
                }
                return toJson(result);
            }
        }
    }

    private static void bind(PreparedStatement statement, Reading reading, int start) throws SQLException {
        statement.setDate(start, Date.valueOf(reading.date()));
        statement.setBigDecimal(start + 1, reading.expected());
        statement.setBigDecimal(start + 2, reading.actual());
        statement.setBigDecimal(start + 3, reading.capacity());
        statement.setBoolean(start + 4, reading.dust());
        statement.setBoolean(start + 5, reading.shade());
        statement.setBoolean(start + 6, reading.inverter());
        statement.setBoolean(start + 7, reading.wiring());
        statement.setString(start + 8, reading.source());
    }

    private static ObjectNode toJson(ResultSet result) throws SQLException {
        ObjectNode row = JSON.createObjectNode();
        row.put("id", result.getLong("id"));
        row.put("date", result.getDate("reading_date").toLocalDate().toString());
        row.put("expected", result.getBigDecimal("expected_kwh"));
        row.put("actual", result.getBigDecimal("actual_kwh"));
        row.put("capacity", result.getBigDecimal("capacity_kw"));
        ObjectNode checks = row.putObject("checks");
        checks.put("dust", result.getBoolean("dust"));
        checks.put("shade", result.getBoolean("shade"));
        checks.put("inverter", result.getBoolean("inverter"));
        checks.put("wiring", result.getBoolean("wiring"));
        row.put("source", result.getString("source"));
        return row;
    }

    private static Reading validate(ObjectNode input) {
        LocalDate date;
        try {
            date = LocalDate.parse(requiredText(input, "date"));
        } catch (RuntimeException e) {
            throw new BadRequestException("Date must use YYYY-MM-DD format.");
        }
        BigDecimal expected = requiredNumber(input, "expected");
        BigDecimal actual = requiredNumber(input, "actual");
        BigDecimal capacity = requiredNumber(input, "capacity");
        if (expected.signum() <= 0 || actual.signum() < 0 || capacity.signum() <= 0) {
            throw new BadRequestException("Expected generation and capacity must be positive; actual generation cannot be negative.");
        }
        JsonNode checks = input.get("checks");
        String source = input.path("source").asText("User");
        if (source.isBlank() || source.length() > 40) {
            throw new BadRequestException("Source must contain between 1 and 40 characters.");
        }
        return new Reading(date, expected, actual, capacity,
                checkValue(checks, "dust"), checkValue(checks, "shade"),
                checkValue(checks, "inverter"), checkValue(checks, "wiring"),
                source);
    }

    private static String requiredText(ObjectNode input, String field) {
        JsonNode value = input.get(field);
        if (value == null || !value.isTextual() || value.asText().isBlank()) {
            throw new BadRequestException("Field '" + field + "' is required.");
        }
        return value.asText();
    }

    private static BigDecimal requiredNumber(ObjectNode input, String field) {
        JsonNode value = input.get(field);
        if (value == null || !value.isNumber()) {
            throw new BadRequestException("Field '" + field + "' must be a number.");
        }
        return value.decimalValue();
    }

    private static boolean checkValue(JsonNode checks, String field) {
        if (checks == null || checks.isNull()) {
            return false;
        }
        JsonNode value = checks.get(field);
        if (value == null || value.isNull()) {
            return false;
        }
        if (!value.isBoolean()) {
            throw new BadRequestException("Observation '" + field + "' must be true or false.");
        }
        return value.booleanValue();
    }

    private static long parseId(String value) {
        try {
            long id = Long.parseLong(value);
            if (id <= 0) {
                throw new NumberFormatException();
            }
            return id;
        } catch (NumberFormatException e) {
            throw new BadRequestException("Reading ID must be a positive integer.");
        }
    }

    private static ObjectNode readRequest(HttpExchange exchange) throws IOException {
        byte[] bytes = exchange.getRequestBody().readNBytes(MAX_REQUEST_BYTES + 1);
        if (bytes.length > MAX_REQUEST_BYTES) {
            throw new BadRequestException("Request body is too large.");
        }
        try {
            JsonNode body = JSON.readTree(bytes);
            if (!(body instanceof ObjectNode object)) {
                throw new BadRequestException("Request body must be a JSON object.");
            }
            return object;
        } catch (IOException e) {
            throw new BadRequestException("Request body is not valid JSON.");
        }
    }

    private void handleStatic(HttpExchange exchange) throws IOException {
        if (!"GET".equals(exchange.getRequestMethod()) && !"HEAD".equals(exchange.getRequestMethod())) {
            sendText(exchange, 405, "Method not allowed.", "text/plain; charset=utf-8");
            return;
        }
        String requestedPath = exchange.getRequestURI().getPath();
        if (requestedPath.equals("/")) {
            requestedPath = "/index.html";
        }
        Path file = webRoot.resolve(requestedPath.substring(1)).normalize();
        if (!file.startsWith(webRoot)) {
            sendText(exchange, 403, "Forbidden.", "text/plain; charset=utf-8");
            return;
        }
        if (!Files.isRegularFile(file)) {
            sendText(exchange, 404, "Not found.", "text/plain; charset=utf-8");
            return;
        }
        String contentType = switch (file.getFileName().toString().toLowerCase()) {
            case "index.html" -> "text/html; charset=utf-8";
            case "style.css" -> "text/css; charset=utf-8";
            case "app.js" -> "text/javascript; charset=utf-8";
            default -> "application/octet-stream";
        };
        byte[] content = Files.readAllBytes(file);
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        if ("HEAD".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(200, -1);
        } else {
            exchange.sendResponseHeaders(200, content.length);
            exchange.getResponseBody().write(content);
        }
        exchange.close();
    }

    private static void sendJson(HttpExchange exchange, int status, JsonNode body) throws IOException {
        sendText(exchange, status, JSON.writeValueAsString(body), "application/json; charset=utf-8");
    }

    private static void sendError(HttpExchange exchange, int status, String message) throws IOException {
        sendJson(exchange, status, JSON.createObjectNode().put("error", message));
    }

    private static void sendText(HttpExchange exchange, int status, String body, String contentType) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private record Reading(LocalDate date, BigDecimal expected, BigDecimal actual, BigDecimal capacity,
                          boolean dust, boolean shade, boolean inverter, boolean wiring, String source) { }

    private static final class BadRequestException extends RuntimeException {
        private BadRequestException(String message) {
            super(message);
        }
    }
}
