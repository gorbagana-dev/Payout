#!/bin/bash

# Solana Validator Utility Functions
# Source this file to use interactive validator functions
# Usage: source test-validator-utils.sh

# Configuration
VALIDATOR_URL="${VALIDATOR_URL:-http://localhost:8899}"
DEFAULT_FAUCET_AMOUNT=1000000000  # 1 SOL in lamports
DEFAULT_TOKEN_DECIMALS=6

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_debug() {
    echo -e "${PURPLE}[DEBUG]${NC} $1"
}

# Helper function to make RPC calls
rpc_call() {
    local method="$1"
    local params="$2"
    local json_payload
    local curl_cmd
    
    if [ -n "$params" ]; then
        json_payload="{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":$params}"
        curl_cmd="curl -s -X POST -H \"Content-Type: application/json\" -d '$json_payload' \"$VALIDATOR_URL\""
    else
        json_payload="{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\"}"
        curl_cmd="curl -s -X POST -H \"Content-Type: application/json\" -d '$json_payload' \"$VALIDATOR_URL\""
    fi
    
    log_debug "Executing RPC call: $method" >&2
    log_debug "JSON payload: $json_payload" >&2
    log_debug "Full curl command: $curl_cmd" >&2
    
    if [ -n "$params" ]; then
        timeout 10 curl -s -X POST -H "Content-Type: application/json" \
            -d "$json_payload" \
            "$VALIDATOR_URL"
    else
        timeout 10 curl -s -X POST -H "Content-Type: application/json" \
            -d "$json_payload" \
            "$VALIDATOR_URL"
    fi
}

# Helper function to check if RPC call was successful
rpc_success() {
    local response="$1"
    echo "$response" | jq -e '.result != null and .error == null' > /dev/null
}

# Helper function to extract result from RPC response
extract_result() {
    echo "$1" | jq -r '.result // empty'
}

# Helper function to get validator stake information
get_validator_stake() {
    local validator_pubkey="$1"
    
    if [ -z "$validator_pubkey" ]; then
        log_error "Validator public key required"
        return 1
    fi
    
    log_info "Getting stake information for validator: $validator_pubkey"
    
    local response=$(rpc_call "getVoteAccounts" "[]")
    
    if ! rpc_success "$response"; then
        log_error "Failed to get vote accounts"
        echo "$response" | jq -r '.error.message // "Unknown error"'
        return 1
    fi
    
    # Extract validator info from current (active) validators
    local validator_info=$(echo "$response" | jq -r --arg pubkey "$validator_pubkey" '
        .result.current[] | select(.nodePubkey == $pubkey) | 
        {
            nodePubkey: .nodePubkey,
            votePubkey: .votePubkey, 
            activatedStake: .activatedStake,
            epochVoteAccount: .epochVoteAccount,
            epochCredits: .epochCredits,
            commission: .commission,
            lastVote: .lastVote,
            rootSlot: .rootSlot
        }
    ')
    
    if [ "$validator_info" = "null" ] || [ -z "$validator_info" ]; then
        # Check delinquent validators
        validator_info=$(echo "$response" | jq -r --arg pubkey "$validator_pubkey" '
            .result.delinquent[] | select(.nodePubkey == $pubkey) | 
            {
                nodePubkey: .nodePubkey,
                votePubkey: .votePubkey, 
                activatedStake: .activatedStake,
                epochVoteAccount: .epochVoteAccount,
                epochCredits: .epochCredits,
                commission: .commission,
                lastVote: .lastVote,
                rootSlot: .rootSlot,
                status: "delinquent"
            }
        ')
        
        if [ "$validator_info" = "null" ] || [ -z "$validator_info" ]; then
            log_warning "Validator not found in vote accounts (may have no stake or be inactive)"
            return 1
        else
            log_warning "Validator found in delinquent validators"
        fi
    fi
    
    # Parse and display stake information
    local activated_stake=$(echo "$validator_info" | jq -r '.activatedStake // 0')
    local vote_pubkey=$(echo "$validator_info" | jq -r '.votePubkey // "unknown"')
    local commission=$(echo "$validator_info" | jq -r '.commission // 0')
    local last_vote=$(echo "$validator_info" | jq -r '.lastVote // 0')
    
    log_success "Validator stake information:"
    echo "  Node Public Key: $validator_pubkey"
    echo "  Vote Public Key: $vote_pubkey"
    echo "  Activated Stake: $(lamports_to_sol $activated_stake) SOL ($activated_stake lamports)"
    echo "  Commission: $commission%"
    echo "  Last Vote Slot: $last_vote"
    
    # Return the stake amount in lamports
    echo "$activated_stake"
}

# Helper function to get all validator stakes (summary)
get_all_validator_stakes() {
    log_info "Getting stake summary for all validators"
    
    local response=$(rpc_call "getVoteAccounts" "[]")
    
    if ! rpc_success "$response"; then
        log_error "Failed to get vote accounts"
        return 1
    fi
    
    # Calculate totals
    local total_current_stake=$(echo "$response" | jq -r '.result.current | map(.activatedStake) | add // 0')
    local total_delinquent_stake=$(echo "$response" | jq -r '.result.delinquent | map(.activatedStake) | add // 0')
    local total_stake=$((total_current_stake + total_delinquent_stake))
    local current_validators=$(echo "$response" | jq -r '.result.current | length')
    local delinquent_validators=$(echo "$response" | jq -r '.result.delinquent | length')
    
    log_success "Network stake summary:"
    echo "  Current Validators: $current_validators"
    echo "  Delinquent Validators: $delinquent_validators"
    echo "  Total Current Stake: $(lamports_to_sol $total_current_stake) SOL"
    echo "  Total Delinquent Stake: $(lamports_to_sol $total_delinquent_stake) SOL"
    echo "  Total Network Stake: $(lamports_to_sol $total_stake) SOL"
    
    if [ $total_stake -gt 0 ]; then
        local current_stake_percent=$(awk "BEGIN {printf \"%.2f\", $total_current_stake * 100.0 / $total_stake}")
        echo "  Current Stake Percentage: $current_stake_percent%"
    fi
}

# Helper function to get validator identity from config
get_validator_identity() {
    # Try to get from docker container
    if command -v docker &> /dev/null; then
        local container_id=$(docker ps --filter "name=agave-validator" --format "{{.ID}}" | head -1)
        if [ -n "$container_id" ]; then
            local identity=$(docker exec "$container_id" solana-keygen pubkey /agave/config/validator-identity.json 2>/dev/null)
            if [ -n "$identity" ] && [ "$identity" != "null" ]; then
                echo "$identity"
                return 0
            fi
        fi
    fi
    
    # Try to get from local config directory
    if [ -f "./data/config/validator-identity.json" ]; then
        local identity=$(solana-keygen pubkey "./data/config/validator-identity.json" 2>/dev/null)
        if [ -n "$identity" ] && [ "$identity" != "null" ]; then
            echo "$identity"
            return 0
        fi
    fi
    
    log_warning "Could not determine validator identity"
    return 1
}

# Helper function to check our own validator's stake
check_my_validator_stake() {
    local validator_identity=$(get_validator_identity)
    
    if [ $? -ne 0 ]; then
        log_error "Could not get validator identity"
        return 1
    fi
    
    log_info "Checking stake for our validator: $validator_identity"
    get_validator_stake "$validator_identity"
}

# Helper function to wait for transaction confirmation
wait_for_confirmation() {
    local signature="$1"
    local max_attempts="${2:-100}"  # Default 100 attempts (300 seconds)
    local attempt=0
    
    log_info "Waiting for transaction confirmation: $signature"
    
    while [ $attempt -lt $max_attempts ]; do
        local response=$(rpc_call "getSignatureStatuses" "[[\"$signature\"]]")
        local status=$(echo "$response" | jq -r '.result.value[0].confirmationStatus // empty')
        local err=$(echo "$response" | jq -r '.result.value[0].err // empty')
        
        if [ $((attempt % 10)) -eq 0 ] && [ $attempt -gt 0 ]; then
            log_debug "Attempt $((attempt + 1))/$max_attempts: Status=$status"
        fi
        
        if [ "$status" = "finalized" ] || [ "$status" = "confirmed" ]; then
            if [ "$err" = "null" ] || [ -z "$err" ]; then
                log_success "Transaction confirmed: $signature"
                return 0
            else
                log_error "Transaction failed with error: $err"
                return 1
            fi
        fi
        
        sleep 3
        attempt=$((attempt + 1))
    done
    
    log_error "Timeout waiting for confirmation after $((max_attempts * 3)) seconds: $signature"
    return 1
}

# ===============================
# VALIDATOR STATUS FUNCTIONS
# ===============================

# Check validator health
check_validator_health() {
    log_info "Checking validator health..."
    log_debug "Using validator URL: $VALIDATOR_URL"
    
    # Test basic connectivity first
    log_debug "Testing basic connectivity to validator..."
    local connectivity_test=$(timeout 5 curl -s -o /dev/null -w "%{http_code}" "$VALIDATOR_URL" 2>/dev/null)
    log_debug "HTTP connectivity test result: $connectivity_test"
    
    if [ "$connectivity_test" != "200" ] && [ "$connectivity_test" != "405" ]; then
        log_error "Cannot connect to validator at $VALIDATOR_URL (HTTP code: $connectivity_test)"
        log_debug "Trying to ping the host..."
        local host=$(echo "$VALIDATOR_URL" | sed 's|http://||' | sed 's|https://||' | cut -d':' -f1)
        if command -v ping >/dev/null 2>&1; then
            ping -c 1 "$host" >/dev/null 2>&1 && log_debug "Host $host is reachable" || log_debug "Host $host is not reachable"
        fi
        return 1
    fi
    
    log_debug "Making RPC health call..."
    local response=$(rpc_call "getHealth")
    local rpc_exit_code=$?
    
    log_debug "RPC call exit code: $rpc_exit_code"
    log_debug "Raw RPC response: $response"
    
    # Check if response is empty or null
    if [ -z "$response" ] || [ "$response" = "null" ]; then
        log_error "Empty or null response from health check"
        log_debug "This could indicate network timeout or validator not responding"
        return 1
    fi
    
    # Check for curl/network errors
    if echo "$response" | grep -q "curl:"; then
        log_error "Network error in health check: $response"
        return 1
    fi
    
    # Parse JSON response for detailed analysis
    if command -v jq >/dev/null 2>&1; then
        local has_result=$(echo "$response" | jq -e 'has("result")' 2>/dev/null)
        local has_error=$(echo "$response" | jq -e 'has("error")' 2>/dev/null)
        local error_message=$(echo "$response" | jq -r '.error.message // empty' 2>/dev/null)
        local error_code=$(echo "$response" | jq -r '.error.code // empty' 2>/dev/null)
        
        log_debug "Response has result field: $has_result"
        log_debug "Response has error field: $has_error"
        
        if [ "$has_error" = "true" ]; then
            log_debug "Error code: $error_code"
            log_debug "Error message: $error_message"
        fi
    else
        log_warning "jq not available for detailed JSON parsing"
    fi
    
    if rpc_success "$response"; then
        log_success "Validator is healthy"
        local result=$(echo "$response" | jq -r '.result // "ok"' 2>/dev/null || echo "ok")
        log_debug "Health check result: $result"
        return 0
    elif echo "$response" | grep -q "behind"; then
        log_warning "Validator is behind but responding (normal for dev networks)"
        log_debug "Behind status is acceptable for single-node development chains"
        return 0
    else
        log_error "Validator health check failed"
        log_debug "Full response analysis:"
        log_debug "  Response length: ${#response} characters"
        log_debug "  Contains 'error': $(echo "$response" | grep -q "error" && echo "yes" || echo "no")"
        log_debug "  Contains 'result': $(echo "$response" | grep -q "result" && echo "yes" || echo "no")"
        log_debug "  Raw response: $response"
        
        # Additional diagnostic information
        log_debug "Attempting additional diagnostic calls..."
        
        # Try getVersion as a simpler RPC call
        local version_response=$(rpc_call "getVersion")
        if rpc_success "$version_response"; then
            log_debug "getVersion call succeeded - RPC endpoint is working"
            local version=$(echo "$version_response" | jq -r '.result."solana-core" // "unknown"' 2>/dev/null)
            log_debug "Validator version: $version"
        else
            log_debug "getVersion call also failed: $version_response"
        fi
        
        return 1
    fi
}

# Get validator version
get_validator_version() {
    log_info "Getting validator version..."
    local response=$(rpc_call "getVersion")
    
    if rpc_success "$response"; then
        local version=$(echo "$response" | jq -r '.result."solana-core" // "unknown"')
        log_success "Validator version: $version"
        echo "$version"
    else
        log_error "Failed to get validator version: $response"
        return 1
    fi
}

# Get current slot
get_current_slot() {
    log_info "Getting current slot..."
    local response=$(rpc_call "getSlot")
    
    if rpc_success "$response"; then
        local slot=$(extract_result "$response")
        log_success "Current slot: $slot"
        echo "$slot"
    else
        log_error "Failed to get current slot: $response"
        return 1
    fi
}

# Get block height
get_block_height() {
    log_info "Getting block height..."
    local response=$(rpc_call "getBlockHeight")
    
    if rpc_success "$response"; then
        local height=$(extract_result "$response")
        log_success "Block height: $height"
        echo "$height"
    else
        log_error "Failed to get block height: $response"
        return 1
    fi
}

# ===============================
# ACCOUNT MANAGEMENT FUNCTIONS
# ===============================

# Create a new keypair and return the public key
create_keypair() {
    local name="${1:-temp_account}"
    local keypair_file="/tmp/${name}.json"
    
    log_info "Creating keypair: $name"
    
    # Create the keypair
    local keygen_result
    keygen_result=$(docker-compose exec -T agave-validator solana-keygen new --no-passphrase --silent --outfile "$keypair_file" --force 2>&1)
    local keygen_exit=$?
    
    if [ $keygen_exit -ne 0 ]; then
        log_error "Failed to create keypair: $keygen_result"
        return 1
    fi
    
    # Extract the public key
    local pubkey_result
    pubkey_result=$(docker-compose exec -T agave-validator solana-keygen pubkey "$keypair_file" 2>&1)
    local pubkey_exit=$?
    
    if [ $pubkey_exit -ne 0 ]; then
        log_error "Failed to extract public key: $pubkey_result"
        return 1
    fi
    
    local pubkey=$(echo "$pubkey_result" | tr -d '\r\n')
    
    # Validate pubkey length (Solana pubkeys can be 43 or 44 characters)
    if [ ${#pubkey} -eq 43 ] || [ ${#pubkey} -eq 44 ]; then
        log_success "Created keypair '$name': $pubkey"
        echo "$pubkey"
        return 0
    else
        log_error "Invalid pubkey length: expected 43-44, got ${#pubkey}"
        return 1
    fi
}

# Get account balance
get_balance() {
    local pubkey="$1"
    
    if [ -z "$pubkey" ]; then
        log_error "Usage: get_balance <pubkey>"
        return 1
    fi
    
    log_info "Getting balance for: $pubkey"
    
    local response=$(rpc_call "getBalance" "[\"$pubkey\"]")
    
    if rpc_success "$response"; then
        local balance=$(echo "$response" | jq -r '.result.value // 0')
        local sol_balance=$(echo "$balance" | awk '{printf "%.9f", $1/1000000000}')
        log_success "Balance: $balance lamports ($sol_balance SOL)"
        echo "$balance"
    else
        log_error "Failed to get balance: $response"
        return 1
    fi
}

# Request airdrop
airdrop() {
    local pubkey="$1"
    local amount="${2:-$DEFAULT_FAUCET_AMOUNT}"
    
    if [ -z "$pubkey" ]; then
        log_error "Usage: airdrop <pubkey> [amount_in_lamports]"
        log_info "Default amount: $DEFAULT_FAUCET_AMOUNT lamports (1 SOL)"
        return 1
    fi
    
    local sol_amount=$(echo "$amount" | awk '{printf "%.9f", $1/1000000000}')
    log_info "Requesting airdrop of $amount lamports ($sol_amount SOL) for: $pubkey"
    
    local response=$(rpc_call "requestAirdrop" "[\"$pubkey\", $amount]")
    
    if rpc_success "$response"; then
        local signature=$(extract_result "$response")
        log_success "Airdrop requested, signature: $signature"
        
        # Wait for confirmation
        if wait_for_confirmation "$signature"; then
            log_success "Airdrop completed successfully!"
            get_balance "$pubkey"
        else
            log_error "Airdrop confirmation failed"
            return 1
        fi
    else
        log_error "Airdrop request failed: $response"
        return 1
    fi
}

# Create and fund a new account (convenience function)
create_and_fund_account() {
    local name="${1:-new_account}"
    local amount="${2:-$DEFAULT_FAUCET_AMOUNT}"
    
    log_info "Creating and funding new account: $name"
    
    local pubkey=$(create_keypair "$name")
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    if airdrop "$pubkey" "$amount"; then
        log_success "Account '$name' created and funded: $pubkey"
        echo "$pubkey"
    else
        log_error "Failed to fund account '$name'"
        return 1
    fi
}

# ===============================
# TRANSACTION FUNCTIONS
# ===============================

# Get transaction details
get_transaction() {
    local signature="$1"
    
    if [ -z "$signature" ]; then
        log_error "Usage: get_transaction <signature>"
        return 1
    fi
    
    log_info "Getting transaction details for: $signature"
    
    local response=$(rpc_call "getTransaction" "[\"$signature\", {\"encoding\": \"json\", \"maxSupportedTransactionVersion\": 0, \"commitment\": \"finalized\"}]")
    
    if rpc_success "$response"; then
        log_success "Transaction found"
        echo "$response" | jq '.result'
    else
        log_warning "Transaction not found or not yet indexed"
        echo "$response" | jq '.error // .result'
    fi
}

# Get signature status
get_signature_status() {
    local signature="$1"
    
    if [ -z "$signature" ]; then
        log_error "Usage: get_signature_status <signature>"
        return 1
    fi
    
    log_info "Getting signature status for: $signature"
    
    local response=$(rpc_call "getSignatureStatuses" "[[\"$signature\"]]")
    
    if rpc_success "$response"; then
        local status=$(echo "$response" | jq -r '.result.value[0].confirmationStatus // "unknown"')
        local err=$(echo "$response" | jq -r '.result.value[0].err // "null"')
        local slot=$(echo "$response" | jq -r '.result.value[0].slot // "unknown"')
        
        log_success "Status: $status, Slot: $slot, Error: $err"
        echo "$response" | jq '.result.value[0]'
    else
        log_error "Failed to get signature status: $response"
        return 1
    fi
}

# ===============================
# BLOCKCHAIN INFO FUNCTIONS
# ===============================

# Get recent blockhash
get_recent_blockhash() {
    log_info "Getting recent blockhash..."
    
    local response=$(rpc_call "getLatestBlockhash")
    
    if rpc_success "$response"; then
        local blockhash=$(echo "$response" | jq -r '.result.value.blockhash // "unknown"')
        local last_valid_height=$(echo "$response" | jq -r '.result.value.lastValidBlockHeight // "unknown"')
        
        log_success "Recent blockhash: $blockhash"
        log_info "Last valid height: $last_valid_height"
        echo "$blockhash"
    else
        log_error "Failed to get recent blockhash: $response"
        return 1
    fi
}

# Get slot leader
get_slot_leader() {
    log_info "Getting current slot leader..."
    
    local response=$(rpc_call "getSlotLeader")
    
    if rpc_success "$response"; then
        local leader=$(extract_result "$response")
        log_success "Slot leader: $leader"
        echo "$leader"
    else
        log_error "Failed to get slot leader: $response"
        return 1
    fi
}

# Get supply information
get_supply_info() {
    log_info "Getting supply information..."
    
    local response=$(rpc_call "getSupply")
    
    if rpc_success "$response"; then
        local total=$(echo "$response" | jq -r '.result.value.total // 0')
        local circulating=$(echo "$response" | jq -r '.result.value.circulating // 0')
        local non_circulating=$(echo "$response" | jq -r '.result.value.nonCirculating // 0')
        
        local total_sol=$(echo "$total" | awk '{printf "%.9f", $1/1000000000}')
        local circulating_sol=$(echo "$circulating" | awk '{printf "%.9f", $1/1000000000}')
        
        log_success "Total supply: $total lamports ($total_sol SOL)"
        log_info "Circulating: $circulating lamports ($circulating_sol SOL)"
        log_info "Non-circulating: $non_circulating lamports"
        
        echo "$response" | jq '.result.value'
    else
        log_error "Failed to get supply information: $response"
        return 1
    fi
}

# ===============================
# SPL TOKEN FUNCTIONS
# ===============================

# Get rent exemption for account size
get_rent_exemption() {
    local size="${1:-165}"  # Default to token account size
    
    log_info "Getting rent exemption for $size bytes..."
    
    local response=$(rpc_call "getMinimumBalanceForRentExemption" "[$size]")
    
    if rpc_success "$response"; then
        local rent=$(extract_result "$response")
        local sol_rent=$(echo "$rent" | awk '{printf "%.9f", $1/1000000000}')
        log_success "Rent exemption: $rent lamports ($sol_rent SOL) for $size bytes"
        echo "$rent"
    else
        log_error "Failed to get rent exemption: $response"
        return 1
    fi
}

# Check if SPL Token program exists
check_spl_token_program() {
    log_info "Checking SPL Token Program..."
    
    local token_program_id="TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    local response=$(rpc_call "getAccountInfo" "[\"$token_program_id\", {\"encoding\": \"base64\"}]")
    
    if rpc_success "$response"; then
        local executable=$(echo "$response" | jq -r '.result.value.executable // false')
        if [ "$executable" = "true" ]; then
            log_success "SPL Token Program is available and executable"
            return 0
        else
            log_warning "SPL Token Program found but not executable"
            return 1
        fi
    else
        log_warning "SPL Token Program not found (expected in development setup)"
        return 1
    fi
}

# ===============================
# UTILITY FUNCTIONS
# ===============================

# Show validator URL
show_validator_url() {
    log_info "Current validator URL: $VALIDATOR_URL"
    echo "$VALIDATOR_URL"
}

# Set validator URL
set_validator_url() {
    local url="$1"
    
    if [ -z "$url" ]; then
        log_error "Usage: set_validator_url <url>"
        log_info "Current URL: $VALIDATOR_URL"
        return 1
    fi
    
    VALIDATOR_URL="$url"
    log_success "Validator URL set to: $VALIDATOR_URL"
}

# Convert lamports to SOL
lamports_to_sol() {
    local lamports="$1"
    
    if [ -z "$lamports" ]; then
        log_error "Usage: lamports_to_sol <lamports>"
        return 1
    fi
    
    # Use awk for floating point math since bc might not be available
    local sol=$(echo "$lamports" | awk '{printf "%.9f", $1/1000000000}')
    echo "$sol SOL"
}

# Convert SOL to lamports
sol_to_lamports() {
    local sol="$1"
    
    if [ -z "$sol" ]; then
        log_error "Usage: sol_to_lamports <sol>"
        return 1
    fi
    
    # Use awk for floating point math
    local lamports=$(echo "$sol" | awk '{printf "%.0f", $1*1000000000}')
    echo "$lamports"
}

# Show help
show_help() {
    echo ""
    echo "🛠️  Solana Validator Utility Functions"
    echo "======================================"
    echo ""
    echo "📋 VALIDATOR STATUS:"
    echo "  check_validator_health      - Check if validator is healthy"
    echo "  get_validator_version       - Get validator version"
    echo "  get_current_slot           - Get current slot number"
    echo "  get_block_height           - Get current block height"
    echo ""
    echo "👤 ACCOUNT MANAGEMENT:"
    echo "  create_keypair [name]      - Create new keypair (returns pubkey)"
    echo "  get_balance <pubkey>       - Get account balance"
    echo "  airdrop <pubkey> [amount]  - Request airdrop (default: 1 SOL)"
    echo "  create_and_fund_account [name] [amount] - Create and fund account"
    echo ""
    echo "💸 TRANSACTIONS:"
    echo "  get_transaction <sig>      - Get transaction details"
    echo "  get_signature_status <sig> - Get signature confirmation status"
    echo "  wait_for_confirmation <sig> [max_attempts] - Wait for confirmation"
    echo ""
    echo "🔗 BLOCKCHAIN INFO:"
    echo "  get_recent_blockhash       - Get recent blockhash"
    echo "  get_slot_leader            - Get current slot leader"
    echo "  get_supply_info            - Get supply information"
    echo ""
    echo "🪙 SPL TOKEN:"
    echo "  get_rent_exemption [size]  - Get rent exemption (default: token account)"
    echo "  check_spl_token_program    - Check if SPL Token program is available"
    echo ""
    echo "🛠️  UTILITIES:"
    echo "  show_validator_url         - Show current validator URL"
    echo "  set_validator_url <url>    - Set validator URL"
    echo "  lamports_to_sol <amount>   - Convert lamports to SOL"
    echo "  sol_to_lamports <amount>   - Convert SOL to lamports"
    echo "  show_help                  - Show this help message"
    echo ""
    echo "💡 EXAMPLES:"
    echo "  # Create and fund a new account"
    echo "  pubkey=\$(create_and_fund_account \"my_account\" \$(sol_to_lamports 2))"
    echo ""
    echo "  # Check balance"
    echo "  get_balance \"\$pubkey\""
    echo ""
    echo "  # Send airdrop"
    echo "  airdrop \"\$pubkey\" \$(sol_to_lamports 0.5)"
    echo ""
}

# Show welcome message when sourced
if [ "${BASH_SOURCE[0]}" != "${0}" ]; then
    echo ""
    log_success "Solana Validator Utils loaded! 🚀"
    log_info "Current validator URL: $VALIDATOR_URL"
    log_info "Type 'show_help' for available functions"
    echo ""
fi
