import { vi } from "vitest";

vi.spyOn(process.stderr, "write").mockImplementation(() => true);
