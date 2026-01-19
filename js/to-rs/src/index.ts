/// <reference types="bun" />
import { feature } from "bun:bundle";


if (feature("DEBUG")) {
    console.log("Hello Development");
}
else {
    console.log("Hello Production");
}