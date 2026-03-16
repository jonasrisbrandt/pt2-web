#pragma once

#include <stdbool.h>
#include <stdio.h>
#include <stdint.h>

bool pp20_unpack_buffer(const uint8_t *input, uint32_t inputLen, uint8_t **output, uint32_t *outputLen);
bool pp20_pack_buffer(const uint8_t *input, uint32_t inputLen, uint8_t **output, uint32_t *outputLen);
uint8_t *unpackPP(FILE *f, uint32_t *filesize);
